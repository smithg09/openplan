// Package server is opendocs' local review HTTP server. It is same-origin with
// the host UI it serves, and serves each document version into a sandboxed
// iframe via the render package so agent HTML stays isolated.
//
// The router is stdlib net/http with Go 1.22 method+wildcard patterns, matching
// openplan's convention (r.PathValue). Route shapes mirror slashdocs' so the
// CLI and agents stay familiar.
package server

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/render"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

//go:embed all:ui/dist
var uiFS embed.FS

// Server serves the review UI and the DocsBackend-shaped JSON API for one
// project's documents.
type Server struct {
	store   store.Backend
	project string
	focus   string // document slug to open first (for `opendocs open`), optional
	version string

	// Proxy mode (nil/unset for the local server): see access.go.
	grants auth.Grants
	signer *auth.Signer

	httpSrv *http.Server

	done     chan struct{} // closed when the reviewer submits their review
	doneOnce sync.Once
}

// New returns a Server scoped to a project within the store.
func New(st store.Backend, project, version string) *Server {
	return &Server{store: st, project: project, version: version, done: make(chan struct{})}
}

// Done is closed once the reviewer submits their review in the UI. The
// `opendocs review` command blocks on it.
func (s *Server) Done() <-chan struct{} { return s.done }

// SetFocus names the document the UI should open on load.
func (s *Server) SetFocus(doc string) { s.focus = doc }

// Handler builds the router (exposed for tests).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/session", s.handleSession)
	if s.multiTenant() {
		// Opaque server-minted ids; no listing of other people's documents.
		mux.HandleFunc("POST /api/docs", s.handleCreateDoc)
		mux.HandleFunc("GET /api/docs/{doc}/shares", s.guard(auth.ActWrite, s.handleListShares))
		mux.HandleFunc("POST /api/docs/{doc}/shares", s.guard(auth.ActWrite, s.handleMintShare))
		mux.HandleFunc("DELETE /api/docs/{doc}/shares/{id}", s.guard(auth.ActWrite, s.handleRevokeShare))
	} else {
		mux.HandleFunc("POST /api/session/done", s.handleDone)
		mux.HandleFunc("GET /api/docs", s.handleListDocs)
	}
	mux.HandleFunc("GET /api/docs/{doc}/access", s.guard(auth.ActRead, s.handleAccess))
	mux.HandleFunc("GET /api/docs/{doc}/versions", s.guard(auth.ActRead, s.handleListVersions))
	mux.HandleFunc("POST /api/docs/{doc}/versions", s.guard(auth.ActWrite, s.handleCreateVersion))
	mux.HandleFunc("GET /api/docs/{doc}/versions/{id}/frame-url", s.guard(auth.ActRead, s.handleFrameURL))
	// The frame is authorised by a signed URL, not a bearer token (see handleFrame).
	mux.HandleFunc("GET /api/docs/{doc}/versions/{id}/frame", s.handleFrame)
	mux.HandleFunc("GET /api/docs/{doc}/comments", s.guard(auth.ActRead, s.handleListComments))
	mux.HandleFunc("POST /api/docs/{doc}/comments", s.guard(auth.ActComment, s.handleAddComment))
	mux.HandleFunc("POST /api/docs/{doc}/comments/{id}/status", s.guard(auth.ActComment, s.handleCommentStatus))
	mux.HandleFunc("POST /api/docs/{doc}/comments/{id}/edit", s.guard(auth.ActModifyOwn, s.handleEditComment))
	mux.HandleFunc("POST /api/docs/{doc}/comments/{id}/react", s.guard(auth.ActComment, s.handleReactComment))
	mux.HandleFunc("DELETE /api/docs/{doc}/comments/{id}", s.guard(auth.ActModifyOwn, s.handleDeleteComment))

	mux.Handle("/", s.uiHandler())
	return guardWrites(mux)
}

// maxBodyBytes caps request bodies (a document version is the largest payload).
const maxBodyBytes = 5 << 20

// guardWrites protects the mutating API from cross-origin and untrusted callers.
//
// The review iframe runs untrusted document scripts (allow-scripts), and any
// website can also target a localhost server. A fetch() with
// `Content-Type: text/plain` is a CORS "simple" request: it is sent without a
// preflight, and our handlers would happily decode it as JSON. Requiring
// `application/json` forces a preflight, which fails because we send no CORS
// headers. Bodies are also size-capped.
func guardWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && r.Method != http.MethodGet && r.Method != http.MethodHead {
			ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if ct != "application/json" {
				writeErr(w, http.StatusUnsupportedMediaType, errors.New("Content-Type must be application/json"))
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// Start begins listening on preferred (0 = any free port), serves in a
// goroutine, and returns the actual port.
func (s *Server) Start(preferred int) (int, error) {
	ln, err := listen(preferred)
	if err != nil {
		return 0, err
	}
	s.httpSrv = &http.Server{Handler: s.Handler()}
	go func() {
		if err := s.httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Printf("opendocs: server error: %v\n", err)
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// Stop shuts the server down gracefully.
func (s *Server) Stop() {
	if s.httpSrv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.httpSrv.Shutdown(ctx)
}

// listen binds the requested port. Port 0 means "pick any free port"; an
// explicit port that is taken is an error, not a silent fallback — otherwise a
// stale server keeps answering on the port the user (or a dev proxy) expects.
func listen(port int) (net.Listener, error) {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		if port != 0 {
			return nil, fmt.Errorf("port %d is unavailable (is another opendocs running?): %w", port, err)
		}
		return nil, err
	}
	return ln, nil
}

// ── API handlers ────────────────────────────────────────────────────────────

func (s *Server) doc(r *http.Request) store.DocStore {
	return s.store.Doc(s.project, r.PathValue("doc"))
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"project": s.project,
		"focus":   s.focus,
		"version": s.version,
		"mode":    map[bool]string{true: "proxy", false: "local"}[s.multiTenant()],
	})
}

// handleDone records that the reviewer finished; idempotent.
func (s *Server) handleDone(w http.ResponseWriter, r *http.Request) {
	s.doneOnce.Do(func() { close(s.done) })
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleListDocs(w http.ResponseWriter, r *http.Request) {
	docs, err := s.store.ListDocs(s.project)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"docs": docs})
}

func (s *Server) handleListVersions(w http.ResponseWriter, r *http.Request, _ principal) {
	versions, err := s.doc(r).ListVersions()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions})
}

type createVersionReq struct {
	HTML         string `json:"html"`
	ExpectedHead string `json:"expectedHead"`
	Label        string `json:"label"`
	Summary      string `json:"summary"`
}

func (s *Server) handleCreateVersion(w http.ResponseWriter, r *http.Request, _ principal) {
	var req createVersionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	v, err := s.doc(r).CreateVersion([]byte(req.HTML), req.ExpectedHead, req.Label, req.Summary)
	if errors.Is(err, store.ErrConflict) {
		writeErr(w, http.StatusConflict, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// handleFrame serves one version's HTML with the bridge injected. This response
// is meant to be loaded into a sandboxed iframe; it must never carry the host's
// credentials, which the sandbox (no allow-same-origin) already guarantees.
func (s *Server) handleFrame(w http.ResponseWriter, r *http.Request) {
	if !s.frameAllowed(r) {
		http.Error(w, "missing, invalid or expired frame signature", http.StatusUnauthorized)
		return
	}
	// Never serve this as a top-level page. Opened directly (a navigation), the
	// agent's HTML would run same-origin with the API and could read/write
	// comments. The UI fetch()es it (Sec-Fetch-Dest: empty) and hands it to a
	// sandboxed srcdoc iframe; a direct iframe load is also fine. Browsers set
	// Sec-Fetch-Dest and pages cannot forge it; non-browser clients (curl, tests)
	// omit it and are not a web threat, so they pass.
	switch r.Header.Get("Sec-Fetch-Dest") {
	case "", "empty", "iframe":
	default:
		http.Error(w, "frame is not served as a page", http.StatusForbidden)
		return
	}
	content, err := s.doc(r).ReadVersion(r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "version not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Isolation comes from the host embedding this in <iframe sandbox="allow-scripts">
	// (no allow-same-origin => opaque origin, no API/cookie access). Direct-open
	// is refused above via Sec-Fetch-Dest; SAMEORIGIN stops other sites embedding
	// it without a sandbox.
	//
	// We deliberately send no `Content-Security-Policy: sandbox` header. An early
	// attempt with it showed net::ERR_BLOCKED_BY_CLIENT in the Claude preview
	// pane, but that error persisted after removing the header, so the cause was
	// never isolated and this is NOT verified in stock Chromium. If it is, adding
	// the header back would be belt-and-braces.
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	_, _ = w.Write(render.Frame(content))
}

func (s *Server) handleListComments(w http.ResponseWriter, r *http.Request, p principal) {
	comments, err := s.doc(r).ListComments()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": toPublic(comments, p)})
}

func (s *Server) handleAddComment(w http.ResponseWriter, r *http.Request, p principal) {
	var c store.Comment
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	c.Owner = p.hash // never trust a client-supplied owner
	saved, err := s.doc(r).AddComment(c)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, toPublic([]store.Comment{saved}, p)[0])
}

type statusReq struct {
	Status string `json:"status"`
}

func (s *Server) handleCommentStatus(w http.ResponseWriter, r *http.Request, _ principal) {
	var req statusReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	err := s.doc(r).SetCommentStatus(r.PathValue("id"), req.Status)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type editReq struct {
	Body string `json:"body"`
}

func (s *Server) handleEditComment(w http.ResponseWriter, r *http.Request, p principal) {
	var req editReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Editing rewrites someone's words: only the author may, whatever their role.
	if !s.requireOwner(w, s.doc(r), r.PathValue("id"), p, false) {
		return
	}
	err := s.doc(r).EditComment(r.PathValue("id"), req.Body)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type reactReq struct {
	Emoji string `json:"emoji"`
	User  string `json:"user"`
}

func (s *Server) handleReactComment(w http.ResponseWriter, r *http.Request, _ principal) {
	var req reactReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	err := s.doc(r).ToggleReaction(r.PathValue("id"), req.Emoji, req.User)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleDeleteComment(w http.ResponseWriter, r *http.Request, p principal) {
	// Authors may delete their own; editors may delete anyone's.
	if !s.requireOwner(w, s.doc(r), r.PathValue("id"), p, p.role.Can(auth.ActWrite)) {
		return
	}
	err := s.doc(r).DeleteComment(r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── UI serving ────────────────────────────────────────────────────────────

// uiHandler serves the embedded host UI build, with SPA fallback to index.html.
// Until opendocs-ui is built into ui/dist, only the .gitkeep is embedded, so we
// serve a built-in placeholder page instead.
func (s *Server) uiHandler() http.Handler {
	sub, err := fs.Sub(uiFS, "ui/dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.placeholder(w, r) })
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.placeholder(w, r) })
	}
	fileServer := http.FileServerFS(sub)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := fs.Stat(sub, trimLeadingSlash(r.URL.Path)); err != nil && r.URL.Path != "/" {
			// SPA fallback: unknown non-asset path -> index.html.
			r2 := new(http.Request)
			*r2 = *r
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func (s *Server) placeholder(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, placeholderHTML, s.project, s.focus)
}

const placeholderHTML = `<!doctype html><html><head><meta charset="utf-8"><title>opendocs</title>
<style>body{font:15px/1.6 -apple-system,system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}code{background:#eef;padding:1px 5px;border-radius:4px}</style>
</head><body><h1>opendocs</h1>
<p>The review server is running. The browser host UI is not built yet — this is the next step of PR&nbsp;2.</p>
<p>Project: <code>%s</code> &middot; Focused doc: <code>%s</code></p>
<p>The JSON API is live under <code>/api/</code> — e.g. <code>/api/docs</code>, <code>/api/docs/{doc}/versions</code>, <code>/api/docs/{doc}/versions/{id}/frame</code>.</p>
</body></html>`

func trimLeadingSlash(p string) string {
	if len(p) > 0 && p[0] == '/' {
		return p[1:]
	}
	return p
}

// ── JSON helpers ────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]any{"error": err.Error()})
}
