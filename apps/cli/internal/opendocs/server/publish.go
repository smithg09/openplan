package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/remote"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// Local-mode sharing: the local UI can set a proxy and publish a document to
// it, so sharing doesn't require the CLI. These routes exist only on the local
// server (the proxy has its own capability/share endpoints). The editor token
// for a published document stays in ~/.opendocs/state.json and is never sent to
// the browser; the UI only ever receives the share links it asks for.

// SetState replaces the CLI state store (tests).
func (s *Server) SetState(st *remote.State) { s.state = st }

func (s *Server) stateStore() *remote.State {
	if s.state == nil {
		s.state = remote.NewState()
	}
	return s.state
}

// publishKey identifies a local document in state.json.
func (s *Server) publishKey(doc string) string { return "doc:" + s.project + "/" + doc }

func (s *Server) handleGetSettings(w http.ResponseWriter, _ *http.Request) {
	proxy, err := s.stateStore().Proxy("")
	if err != nil && !errors.Is(err, remote.ErrNoProxy) {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proxy": proxy})
}

func (s *Server) handleSetSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Proxy string `json:"proxy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	req.Proxy = strings.TrimSpace(req.Proxy)
	if req.Proxy != "" {
		c, err := remote.NewClient(req.Proxy)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		req.Proxy = c.Base
	}
	if err := s.stateStore().SetProxy(req.Proxy); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proxy": req.Proxy})
}

// handleRemoteStatus reports whether a document has been published, and where.
func (s *Server) handleRemoteStatus(w http.ResponseWriter, r *http.Request) {
	p, ok, err := s.stateStore().Lookup(s.publishKey(r.PathValue("doc")))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"published": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"published": true, "proxy": p.Proxy, "id": p.ID})
}

// handlePublish uploads the head version: creating the remote document the first
// time, or adding a version to the one already published.
func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Proxy   string `json:"proxy"`
		Summary string `json:"summary"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // body is optional
	slug := r.PathValue("doc")
	d := s.store.Doc(s.project, slug)
	head, err := d.Head()
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("this document has no versions to publish"))
		return
	}
	content, err := d.ReadVersion(head.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	st := s.stateStore()
	key := s.publishKey(slug)
	prev, published, err := st.Lookup(key)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	proxyURL := prev.Proxy
	if !published || strings.TrimSpace(req.Proxy) != "" {
		if proxyURL, err = st.Proxy(strings.TrimSpace(req.Proxy)); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
	}
	c, err := remote.NewClient(proxyURL)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if published && prev.Proxy != c.Base {
		published = false // a different proxy: start a fresh remote document
	}

	resp := map[string]any{"proxy": c.Base}
	var pub remote.Published
	if published {
		pub = prev
		v, err := c.PublishVersion(prev.ID, prev.EditorToken, string(content), head.Label, req.Summary)
		switch {
		case err == nil:
			resp["id"], resp["new"], resp["versionId"] = prev.ID, false, v.ID
		case remote.IsGone(err):
			published = false // the proxy lost this document (e.g. its storage was reset): publish it afresh
		default:
			writeErr(w, http.StatusBadGateway, err)
			return
		}
	}
	if !published {
		created, err := c.CreateDoc(string(content), head.Label, req.Summary)
		if err != nil {
			writeErr(w, http.StatusBadGateway, err)
			return
		}
		pub = remote.Published{Proxy: c.Base, ID: created.ID, EditorToken: created.EditorToken}
		if err := st.Remember(key, pub); err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		resp["id"], resp["new"] = created.ID, true
	}

	// Carry the local review along: people opening the shared link should see the
	// comments already made. A failure here doesn't undo the publish.
	n, err := syncComments(c, d, st, key, pub)
	resp["comments"] = n
	if err != nil {
		resp["commentsError"] = err.Error()
	}
	writeJSON(w, http.StatusOK, resp)
}

// syncComments posts local comments the proxy has not seen (threads before their
// replies) and remembers the id mapping. It returns how many were sent.
func syncComments(c *remote.Client, d store.DocStore, st *remote.State, key string, pub remote.Published) (int, error) {
	local, err := d.ListComments()
	if err != nil {
		return 0, err
	}
	if pub.Comments == nil {
		pub.Comments = map[string]string{}
	}
	sent := 0
	var firstErr error
	send := func(in store.Comment) {
		if _, done := pub.Comments[in.ID]; done || firstErr != nil {
			return
		}
		localID, status := in.ID, in.Status
		if in.RootCommentID != "" {
			root, ok := pub.Comments[in.RootCommentID]
			if !ok {
				return
			}
			in.RootCommentID = root
		}
		in.ID = ""
		saved, err := c.AddComment(pub.ID, pub.EditorToken, in)
		if err != nil {
			firstErr = err
			return
		}
		pub.Comments[localID] = saved.ID
		sent++
		if status == store.StatusResolved {
			_ = c.SetCommentStatus(pub.ID, pub.EditorToken, saved.ID, status)
		}
	}
	for _, cm := range local {
		if cm.RootCommentID == "" {
			send(cm)
		}
	}
	for _, cm := range local {
		if cm.RootCommentID != "" {
			send(cm)
		}
	}
	if err := st.Remember(key, pub); err != nil && firstErr == nil {
		firstErr = err
	}
	return sent, firstErr
}

// handleRemoteLink mints a fresh share link for the published document. Each call
// creates a new revocable token, so the UI asks only when the user clicks "copy".
func (s *Server) handleRemoteLink(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Role  string `json:"role"`
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p, ok, err := s.stateStore().Lookup(s.publishKey(r.PathValue("doc")))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeErr(w, http.StatusBadRequest, errors.New("publish this document first"))
		return
	}
	c, err := remote.NewClient(p.Proxy)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	role, err := auth.ParseRole(req.Role)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	token, err := c.MintShare(p.ID, p.EditorToken, role.String(), req.Label)
	if remote.IsGone(err) {
		writeErr(w, http.StatusConflict, errors.New("this document is no longer on the proxy — click “Publish latest version” to publish it again"))
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"link": c.ShareURL(p.ID, token), "role": role.String()})
}
