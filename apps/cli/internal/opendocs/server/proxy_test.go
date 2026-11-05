package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

type proxyEnv struct {
	t      *testing.T
	h      http.Handler
	signer *auth.Signer
}

func newProxyEnv(t *testing.T) *proxyEnv {
	t.Helper()
	key, _ := auth.NewRandomKey()
	signer, _ := auth.NewSigner(key)
	grants := auth.NewFileGrants(filepath.Join(t.TempDir(), "grants.json"))
	st := store.NewWithBase(t.TempDir()).Backend()
	return &proxyEnv{t: t, h: NewProxy(st, grants, signer, "test").Handler(), signer: signer}
}

func (e *proxyEnv) call(token, method, path string, body any) *httptest.ResponseRecorder {
	e.t.Helper()
	var r *http.Request
	if body != nil {
		buf, _ := json.Marshal(body)
		r = httptest.NewRequest(method, path, bytes.NewReader(buf))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if method != "GET" {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, r)
	return w
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", w.Body.String(), err)
	}
	return v
}

// setup creates a doc and returns its id plus one token per role.
func (e *proxyEnv) setup() (doc, editor, commenter, viewer string) {
	e.t.Helper()
	w := e.call("", "POST", "/api/docs", map[string]string{"html": "<p>hello world</p>"})
	if w.Code != 200 {
		e.t.Fatalf("create doc: %d %s", w.Code, w.Body)
	}
	c := decode[struct {
		ID          string `json:"id"`
		EditorToken string `json:"editorToken"`
	}](e.t, w)
	mint := func(role string) string {
		w := e.call(c.EditorToken, "POST", "/api/docs/"+c.ID+"/shares", map[string]string{"role": role})
		if w.Code != 200 {
			e.t.Fatalf("mint %s: %d %s", role, w.Code, w.Body)
		}
		return decode[struct {
			Token string `json:"token"`
		}](e.t, w).Token
	}
	return c.ID, c.EditorToken, mint("commenter"), mint("viewer")
}

func TestProxyAuthMatrix(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, commenter, viewer := e.setup()
	base := "/api/docs/" + doc

	// Seed a comment as the commenter so status/react/edit have a target.
	w := e.call(commenter, "POST", base+"/comments", map[string]any{"body": "hi", "createdOnVersionId": "v"})
	if w.Code != 200 {
		t.Fatalf("seed comment: %d %s", w.Code, w.Body)
	}
	cid := decode[publicComment](t, w).ID

	type tc struct {
		name, token, method, path string
		body                      any
		want                      int
	}
	cases := []tc{
		// no / bad token -> 401 everywhere, indistinguishable from an unknown doc
		{"no token read", "", "GET", base + "/versions", nil, 401},
		{"bad token read", "nope", "GET", base + "/comments", nil, 401},
		{"unknown doc", editor, "GET", "/api/docs/deadbeef/versions", nil, 401},
		{"token of another doc", editor, "GET", "/api/docs/otherdoc/comments", nil, 401},

		// viewer: read only
		{"viewer reads versions", viewer, "GET", base + "/versions", nil, 200},
		{"viewer reads comments", viewer, "GET", base + "/comments", nil, 200},
		{"viewer cannot comment", viewer, "POST", base + "/comments", map[string]any{"body": "x"}, 403},
		{"viewer cannot react", viewer, "POST", base + "/comments/" + cid + "/react", map[string]string{"emoji": "👍", "user": "v"}, 403},
		{"viewer cannot resolve", viewer, "POST", base + "/comments/" + cid + "/status", map[string]string{"status": "resolved"}, 403},
		{"viewer cannot publish", viewer, "POST", base + "/versions", createVersionReq{HTML: "x"}, 403},
		{"viewer cannot share", viewer, "POST", base + "/shares", map[string]string{"role": "viewer"}, 403},
		{"viewer cannot list shares", viewer, "GET", base + "/shares", nil, 403},

		// commenter: comment, not publish/share
		{"commenter comments", commenter, "POST", base + "/comments", map[string]any{"body": "y"}, 200},
		{"commenter reacts", commenter, "POST", base + "/comments/" + cid + "/react", map[string]string{"emoji": "👍", "user": "c"}, 200},
		{"commenter resolves", commenter, "POST", base + "/comments/" + cid + "/status", map[string]string{"status": "resolved"}, 200},
		{"commenter cannot publish", commenter, "POST", base + "/versions", createVersionReq{HTML: "x"}, 403},
		{"commenter cannot share", commenter, "POST", base + "/shares", map[string]string{"role": "editor"}, 403},

		// editor
		{"editor publishes", editor, "POST", base + "/versions", createVersionReq{HTML: "<p>v2</p>"}, 200},
		{"editor lists shares", editor, "GET", base + "/shares", nil, 200},
		{"editor cannot mint role none", editor, "POST", base + "/shares", map[string]string{"role": "none"}, 400},
	}
	for _, c := range cases {
		if got := e.call(c.token, c.method, c.path, c.body); got.Code != c.want {
			t.Errorf("%s: %s %s = %d, want %d (%s)", c.name, c.method, c.path, got.Code, c.want, strings.TrimSpace(got.Body.String()))
		}
	}
}

func TestProxyCommentOwnership(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, alice, _ := e.setup()
	base := "/api/docs/" + doc
	bob := decode[struct {
		Token string `json:"token"`
	}](t, e.call(editor, "POST", base+"/shares", map[string]string{"role": "commenter"})).Token

	w := e.call(alice, "POST", base+"/comments", map[string]any{"body": "alice's", "owner": "forged-hash"})
	a := decode[publicComment](t, w)
	if !a.Mine || a.Owner != "" {
		t.Fatalf("response should flag mine and hide owner: %+v", a)
	}
	edit := map[string]string{"body": "changed"}

	if got := e.call(bob, "POST", base+"/comments/"+a.ID+"/edit", edit).Code; got != 403 {
		t.Errorf("another commenter editing = %d, want 403", got)
	}
	if got := e.call(editor, "POST", base+"/comments/"+a.ID+"/edit", edit).Code; got != 403 {
		t.Errorf("even an editor must not rewrite someone else's words, got %d", got)
	}
	if got := e.call(alice, "POST", base+"/comments/"+a.ID+"/edit", edit).Code; got != 200 {
		t.Errorf("author editing = %d, want 200", got)
	}
	if got := e.call(bob, "DELETE", base+"/comments/"+a.ID, nil).Code; got != 403 {
		t.Errorf("another commenter deleting = %d, want 403", got)
	}

	// "mine" is per-caller, and the owner hash never leaves the server.
	list := decode[struct {
		Comments []publicComment `json:"comments"`
	}](t, e.call(bob, "GET", base+"/comments", nil))
	if len(list.Comments) != 1 || list.Comments[0].Mine {
		t.Errorf("bob must not see alice's comment as his: %+v", list.Comments)
	}
	if raw := e.call(bob, "GET", base+"/comments", nil).Body.String(); strings.Contains(raw, `"owner"`) {
		t.Errorf("owner hash leaked to client: %s", raw)
	}

	if got := e.call(editor, "DELETE", base+"/comments/"+a.ID, nil).Code; got != 200 {
		t.Errorf("editor deleting any comment = %d, want 200", got)
	}
	if got := e.call(alice, "DELETE", base+"/comments/"+a.ID, nil).Code; got != 404 {
		t.Errorf("deleting a missing comment = %d, want 404", got)
	}
}

func TestProxyDocsAreIsolatedAndUnlisted(t *testing.T) {
	e := newProxyEnv(t)
	d1, ed1, _, _ := e.setup()
	d2, ed2, _, _ := e.setup()
	if d1 == d2 {
		t.Fatal("doc ids must be unique")
	}
	if got := e.call(ed1, "GET", "/api/docs/"+d2+"/versions", nil).Code; got != 401 {
		t.Errorf("doc1 editor reading doc2 = %d, want 401", got)
	}
	if got := e.call(ed2, "GET", "/api/docs/"+d1+"/versions", nil).Code; got != 401 {
		t.Errorf("doc2 editor reading doc1 = %d, want 401", got)
	}
	// No enumeration endpoint in proxy mode: GET /api/docs falls through to the UI.
	w := e.call(ed1, "GET", "/api/docs", nil)
	if strings.Contains(w.Body.String(), d1) || strings.Contains(w.Body.String(), d2) {
		t.Errorf("proxy must not list docs: %s", w.Body)
	}
}

func TestProxyTwoClientsSeeEachOther(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, commenter, viewer := e.setup()
	base := "/api/docs/" + doc
	e.call(commenter, "POST", base+"/comments", map[string]any{"body": "from the commenter"})
	e.call(editor, "POST", base+"/comments", map[string]any{"body": "from the editor"})
	for name, tok := range map[string]string{"viewer": viewer, "commenter": commenter, "editor": editor} {
		got := decode[struct {
			Comments []publicComment `json:"comments"`
		}](t, e.call(tok, "GET", base+"/comments", nil))
		if len(got.Comments) != 2 {
			t.Errorf("%s sees %d comments, want 2", name, len(got.Comments))
		}
	}
}

func TestProxyRevokedTokenStopsWorking(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, commenter, _ := e.setup()
	base := "/api/docs/" + doc
	shares := decode[struct {
		Shares []struct{ ID, Role string } `json:"shares"`
	}](t, e.call(editor, "GET", base+"/shares", nil))
	var id string
	for _, s := range shares.Shares {
		if s.Role == "commenter" {
			id = s.ID
		}
	}
	if got := e.call(editor, "DELETE", base+"/shares/"+id, nil).Code; got != 200 {
		t.Fatalf("revoke = %d", got)
	}
	if got := e.call(commenter, "GET", base+"/comments", nil).Code; got != 401 {
		t.Errorf("revoked token = %d, want 401", got)
	}
}

func TestProxyFrameRequiresSignature(t *testing.T) {
	e := newProxyEnv(t)
	doc, _, _, viewer := e.setup()
	vs := decode[struct {
		Versions []store.Version `json:"versions"`
	}](t, e.call(viewer, "GET", "/api/docs/"+doc+"/versions", nil))
	ver := vs.Versions[0].ID
	frame := "/api/docs/" + doc + "/versions/" + ver + "/frame"

	if got := e.call("", "GET", frame, nil).Code; got != 401 {
		t.Errorf("unsigned frame = %d, want 401", got)
	}
	if got := e.call(viewer, "GET", frame, nil).Code; got != 401 {
		t.Errorf("a bearer token alone must not open the frame, got %d", got)
	}
	if got := e.call("", "GET", frame+"?sig=garbage", nil).Code; got != 401 {
		t.Errorf("bad signature = %d, want 401", got)
	}

	// Authed call yields a working signed URL, and it carries no capability token.
	u := decode[struct {
		URL string `json:"url"`
	}](t, e.call(viewer, "GET", frame+"-url", nil)).URL
	if strings.Contains(u, viewer) {
		t.Fatal("frame URL must never contain the capability token")
	}
	w := e.call("", "GET", u, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "hello world") {
		t.Fatalf("signed frame = %d %s", w.Code, w.Body)
	}
	if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Errorf("frame must not be cached, got %q", cc)
	}

	// Signature is bound to doc+version and to time.
	other := e.signer.Sign(doc, "some-other-version", time.Now().Add(time.Minute))
	if got := e.call("", "GET", frame+"?sig="+other, nil).Code; got != 401 {
		t.Errorf("signature for another version = %d, want 401", got)
	}
	expired := e.signer.Sign(doc, ver, time.Now().Add(-time.Second))
	if got := e.call("", "GET", frame+"?sig="+expired, nil).Code; got != 401 {
		t.Errorf("expired signature = %d, want 401", got)
	}
}

func TestProxyAccessEndpointReportsRole(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, commenter, viewer := e.setup()
	for tok, want := range map[string]string{editor: "editor", commenter: "commenter", viewer: "viewer"} {
		got := decode[map[string]string](t, e.call(tok, "GET", "/api/docs/"+doc+"/access", nil))
		if got["role"] != want {
			t.Errorf("role = %q, want %q", got["role"], want)
		}
	}
}

func TestProxySessionAdvertisesMode(t *testing.T) {
	e := newProxyEnv(t)
	if got := decode[map[string]any](t, e.call("", "GET", "/api/session", nil)); got["mode"] != "proxy" {
		t.Errorf("mode = %v", got["mode"])
	}
	s, _ := newTestServer(t)
	if got := decode[map[string]any](t, do(t, s.Handler(), "GET", "/api/session", nil)); got["mode"] != "local" {
		t.Errorf("mode = %v", got["mode"])
	}
}

func TestProxyRateLimitsAndQuotas(t *testing.T) {
	key, _ := auth.NewRandomKey()
	signer, _ := auth.NewSigner(key)
	grants := auth.NewFileGrants(filepath.Join(t.TempDir(), "g.json"))
	srv := NewProxy(store.NewWithBase(t.TempDir()).Backend(), grants, signer, "t").
		WithLimits(Limits{CreatePerHour: 2, WritePerMin: 1000, MaxVersions: 2, MaxComments: 2, MaxCommentLen: 5})
	e := &proxyEnv{t: t, h: srv.Handler(), signer: signer}

	// Creating docs is rate-limited per client; reads are not.
	codes := []int{}
	var id, tok string
	for range 3 {
		w := e.call("", "POST", "/api/docs", map[string]string{"html": "x"})
		codes = append(codes, w.Code)
		if w.Code == 200 && id == "" {
			c := decode[struct{ ID, EditorToken string }](t, w)
			id = c.ID
			tok = decode[map[string]any](t, w)["editorToken"].(string)
		}
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != 429 {
		t.Fatalf("create codes = %v, want [200 200 429]", codes)
	}
	if w := e.call("", "POST", "/api/docs", map[string]string{}); w.Header().Get("Retry-After") == "" {
		t.Error("429 should carry Retry-After")
	}
	if got := e.call(tok, "GET", "/api/docs/"+id+"/versions", nil).Code; got != 200 {
		t.Errorf("reads must not be limited, got %d", got)
	}

	base := "/api/docs/" + id
	if got := e.call(tok, "POST", base+"/versions", createVersionReq{HTML: "two"}).Code; got != 200 {
		t.Fatalf("second version = %d", got)
	}
	if got := e.call(tok, "POST", base+"/versions", createVersionReq{HTML: "three"}).Code; got != 413 {
		t.Errorf("over version quota = %d, want 413", got)
	}
	if got := e.call(tok, "POST", base+"/comments", map[string]any{"body": "way too long"}).Code; got != 413 {
		t.Errorf("over comment length = %d, want 413", got)
	}
	e.call(tok, "POST", base+"/comments", map[string]any{"body": "a"})
	e.call(tok, "POST", base+"/comments", map[string]any{"body": "b"})
	if got := e.call(tok, "POST", base+"/comments", map[string]any{"body": "c"}).Code; got != 413 {
		t.Errorf("over comment count = %d, want 413", got)
	}
}

func TestRateLimiterRefill(t *testing.T) {
	rl := newRateLimiter(2, time.Minute)
	now := time.Unix(0, 0)
	rl.now = func() time.Time { return now }
	for range 2 {
		if _, ok := rl.allow("a"); !ok {
			t.Fatal("burst should pass")
		}
	}
	if _, ok := rl.allow("a"); ok {
		t.Fatal("third should be refused")
	}
	if _, ok := rl.allow("b"); !ok {
		t.Error("buckets are per key")
	}
	now = now.Add(31 * time.Second)
	if _, ok := rl.allow("a"); !ok {
		t.Error("a token should have refilled after half the window")
	}
}

func TestClientIPTrustProxy(t *testing.T) {
	s := &Server{}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:5555"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 9.9.9.9")
	if got := s.clientIP(r); got != "10.0.0.1" {
		t.Errorf("untrusted XFF must be ignored, got %s", got)
	}
	s.limits.TrustProxy = true
	if got := s.clientIP(r); got != "9.9.9.9" {
		t.Errorf("trusted proxy: want last hop 9.9.9.9 (not client-forged), got %s", got)
	}
}
