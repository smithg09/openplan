package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// Access control (proxy mode).
//
// A Server built with New is the local, single-user server: every request acts
// as an editor. A Server built with NewProxy is multi-tenant: documents have
// opaque server-minted ids, there is no "list all docs", and every request is
// authorised by a capability token (Authorization: Bearer) whose role is looked
// up per document.

// frameTTL bounds how long a signed frame URL stays valid. The frame is loaded
// once per version view; leaking the URL exposes one version for minutes and
// never grants write access.
const frameTTL = 5 * time.Minute

// principal is who a request acts as on one document.
type principal struct {
	role auth.Role
	hash string // token hash; "" for the local single-user server
}

// tenant reports whether the principal came from a capability token.
func (p principal) tenant() bool { return p.hash != "" }

// NewProxy returns a multi-tenant Server. All documents live under one fixed
// project; callers are identified only by capability tokens held in grants.
func NewProxy(st store.Backend, grants auth.Grants, signer *auth.Signer, version string) *Server {
	s := New(st, "proxy", version)
	s.grants, s.signer = grants, signer
	return s
}

func (s *Server) multiTenant() bool { return s.grants != nil }

// principalFor resolves the caller for doc. ok is false when the request has no
// valid token for that document.
func (s *Server) principalFor(r *http.Request, doc string) (principal, bool) {
	if !s.multiTenant() {
		return principal{role: auth.RoleEditor}, true
	}
	g, ok := s.grants.Lookup(doc, auth.BearerToken(r.Header.Get("Authorization")))
	if !ok {
		return principal{}, false
	}
	return principal{role: g.Role, hash: g.TokenHash}, true
}

type authedHandler func(w http.ResponseWriter, r *http.Request, p principal)

// guard wraps h so it runs only when the caller's role permits act on the
// document named in the path. Invalid or missing tokens get 401 (identical
// whether or not the doc exists, so ids cannot be probed); a valid token with
// too little power gets 403.
func (s *Server) guard(act auth.Action, h authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.principalFor(r, r.PathValue("doc"))
		if !ok {
			w.Header().Set("WWW-Authenticate", `Bearer realm="opendocs"`)
			writeErr(w, http.StatusUnauthorized, errors.New("missing or invalid token"))
			return
		}
		if !p.role.Can(act) {
			writeErr(w, http.StatusForbidden, fmt.Errorf("a %s link cannot do this", p.role))
			return
		}
		s.publishAfter(w, r, func(w http.ResponseWriter) { h(w, r, p) })
	}
}

// publicComment is a comment as sent to clients: the owner hash is replaced by
// a "mine" flag so the UI can show edit/delete controls without learning hashes.
type publicComment struct {
	store.Comment
	Mine bool `json:"mine"`
}

func toPublic(cs []store.Comment, p principal) []publicComment {
	out := make([]publicComment, len(cs))
	for i, c := range cs {
		mine := !p.tenant() || c.Owner == p.hash // local mode: everything is yours
		c.Owner = ""
		out[i] = publicComment{Comment: c, Mine: mine}
	}
	return out
}

// ownsComment reports whether p may modify comment id as its author. Local mode
// (no token) owns everything.
func (s *Server) ownsComment(d store.DocStore, id string, p principal) (found, owns bool, err error) {
	cs, err := d.ListComments()
	if err != nil {
		return false, false, err
	}
	for _, c := range cs {
		if c.ID == id {
			return true, !p.tenant() || c.Owner == p.hash, nil
		}
	}
	return false, false, nil
}

func newDocID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// ── proxy-only endpoints ────────────────────────────────────────────────────

type createDocReq struct {
	HTML    string `json:"html"`
	Label   string `json:"label"`
	Summary string `json:"summary"`
}

// handleCreateDoc mints an opaque doc id and its first editor token. It is the
// only unauthenticated write; abuse limits (rate/size) belong to the deployment.
func (s *Server) handleCreateDoc(w http.ResponseWriter, r *http.Request) {
	var req createDocReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	id, err := newDocID()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	token, _, err := s.grants.Mint(id, auth.RoleEditor, "creator")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	resp := map[string]any{"id": id, "editorToken": token}
	if req.HTML != "" {
		v, err := s.store.Doc(s.project, id).CreateVersion([]byte(req.HTML), "", req.Label, req.Summary)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		resp["version"] = v
	}
	writeJSON(w, http.StatusOK, resp)
}

type shareReq struct {
	Role  string `json:"role"`
	Label string `json:"label"`
}

func (s *Server) handleMintShare(w http.ResponseWriter, r *http.Request, _ principal) {
	var req shareReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	role, err := auth.ParseRole(req.Role)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	token, g, err := s.grants.Mint(r.PathValue("doc"), role, req.Label)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "role": role.String(), "id": g.TokenHash, "label": g.Label})
}

func (s *Server) handleListShares(w http.ResponseWriter, r *http.Request, _ principal) {
	gs, err := s.grants.List(r.PathValue("doc"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	out := make([]map[string]any, 0, len(gs))
	for _, g := range gs {
		out = append(out, map[string]any{"id": g.TokenHash, "role": g.Role.String(), "label": g.Label, "createdAt": g.CreatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"shares": out})
}

func (s *Server) handleRevokeShare(w http.ResponseWriter, r *http.Request, _ principal) {
	err := s.grants.Revoke(r.PathValue("doc"), r.PathValue("id"))
	if errors.Is(err, auth.ErrGrantNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAccess tells the UI what the presented token may do.
func (s *Server) handleAccess(w http.ResponseWriter, _ *http.Request, p principal) {
	writeJSON(w, http.StatusOK, map[string]any{"role": p.role.String()})
}

// handleFrameURL returns a short-lived signed URL for loading one version into
// the sandboxed iframe (which cannot send an Authorization header).
func (s *Server) handleFrameURL(w http.ResponseWriter, r *http.Request, _ principal) {
	doc, ver := r.PathValue("doc"), r.PathValue("id")
	u := "/api/docs/" + url.PathEscape(doc) + "/versions/" + url.PathEscape(ver) + "/frame"
	if s.signer != nil {
		u += "?sig=" + url.QueryEscape(s.signer.Sign(doc, ver, time.Now().Add(frameTTL)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": u})
}

// frameAllowed authorises a frame request: in proxy mode only a valid signature
// for exactly this doc+version passes.
func (s *Server) frameAllowed(r *http.Request) bool {
	if !s.multiTenant() {
		return true
	}
	return s.signer != nil && s.signer.Verify(r.PathValue("doc"), r.PathValue("id"), r.URL.Query().Get("sig"), time.Now())
}

// requireOwner writes a 404/403 and returns false unless the comment exists and
// p authored it (or override is true, e.g. an editor deleting).
func (s *Server) requireOwner(w http.ResponseWriter, d store.DocStore, id string, p principal, override bool) bool {
	found, owns, err := s.ownsComment(d, id, p)
	switch {
	case err != nil:
		writeErr(w, http.StatusInternalServerError, err)
	case !found:
		writeErr(w, http.StatusNotFound, store.ErrNotFound)
	case !owns && !override:
		writeErr(w, http.StatusForbidden, errors.New("only the author can change this comment"))
	default:
		return true
	}
	return false
}
