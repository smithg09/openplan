package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

func newTestServer(t *testing.T) (*Server, *store.Doc) {
	t.Helper()
	st := store.NewWithBase(t.TempDir())
	s := New(st.Backend(), "proj", "test")
	return s, st.Doc("proj", "report")
}

func do(t *testing.T, h http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body != nil {
		buf, _ := json.Marshal(body)
		r = httptest.NewRequest(method, path, bytes.NewReader(buf))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if method != "GET" {
		r.Header.Set("Content-Type", "application/json") // like the real UI client
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestCreateAndListVersionsAPI(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	w := do(t, h, "POST", "/api/docs/report/versions", createVersionReq{HTML: "<h1>hi</h1>", Label: "v1"})
	if w.Code != http.StatusOK {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var v store.Version
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	if v.ID == "" {
		t.Fatal("no version id returned")
	}

	w = do(t, h, "GET", "/api/docs/report/versions", nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), v.ID) {
		t.Fatalf("list versions missing id: %d %s", w.Code, w.Body)
	}
}

func TestOptimisticConflictAPI(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	w := do(t, h, "POST", "/api/docs/report/versions", createVersionReq{HTML: "one"})
	var v1 store.Version
	_ = json.Unmarshal(w.Body.Bytes(), &v1)

	// Correct head -> ok.
	w = do(t, h, "POST", "/api/docs/report/versions", createVersionReq{HTML: "two", ExpectedHead: v1.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	// Stale head -> 409.
	w = do(t, h, "POST", "/api/docs/report/versions", createVersionReq{HTML: "three", ExpectedHead: v1.ID})
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 conflict, got %d %s", w.Code, w.Body)
	}
}

func TestFrameInjectsBridge(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<html><head></head><body><p>hello world</p></body></html>"), "", "", "")

	w := do(t, s.Handler(), "GET", "/api/docs/report/versions/"+v.ID+"/frame", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("frame: %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("content-type = %q", ct)
	}
	body := w.Body.String()
	if !strings.Contains(body, "opendocs:ready") {
		t.Error("bridge not injected into frame")
	}
	if !strings.Contains(body, "hello world") {
		t.Error("document content missing from frame")
	}
}

func TestCommentsAPI(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<p>the quick brown fox</p>"), "", "", "")
	h := s.Handler()

	w := do(t, h, "POST", "/api/docs/report/comments", store.Comment{
		Body:               "typo?",
		CreatedOnVersionID: v.ID,
		Anchor:             &store.Anchor{Quote: "quick brown"},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("add comment: %d %s", w.Code, w.Body)
	}
	var c store.Comment
	_ = json.Unmarshal(w.Body.Bytes(), &c)

	w = do(t, h, "POST", "/api/docs/report/comments/"+c.ID+"/status", statusReq{Status: store.StatusResolved})
	if w.Code != http.StatusOK {
		t.Fatalf("set status: %d %s", w.Code, w.Body)
	}

	w = do(t, h, "GET", "/api/docs/report/comments", nil)
	if !strings.Contains(w.Body.String(), store.StatusResolved) {
		t.Errorf("resolved status not reflected: %s", w.Body)
	}

	// Bad status -> 400.
	w = do(t, h, "POST", "/api/docs/report/comments/"+c.ID+"/status", statusReq{Status: "bogus"})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad status, got %d", w.Code)
	}
}

func TestEditReactDeleteAPI(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<p>x</p>"), "", "", "")
	h := s.Handler()

	w := do(t, h, "POST", "/api/docs/report/comments", store.Comment{Body: "orig", CreatedOnVersionID: v.ID, Anchor: &store.Anchor{Quote: "x"}})
	var c store.Comment
	_ = json.Unmarshal(w.Body.Bytes(), &c)

	if w = do(t, h, "POST", "/api/docs/report/comments/"+c.ID+"/edit", editReq{Body: "updated"}); w.Code != http.StatusOK {
		t.Fatalf("edit: %d %s", w.Code, w.Body)
	}
	if w = do(t, h, "POST", "/api/docs/report/comments/"+c.ID+"/react", reactReq{Emoji: "👍", User: "me"}); w.Code != http.StatusOK {
		t.Fatalf("react: %d %s", w.Code, w.Body)
	}
	w = do(t, h, "GET", "/api/docs/report/comments", nil)
	if !strings.Contains(w.Body.String(), "updated") || !strings.Contains(w.Body.String(), "👍") {
		t.Errorf("edit/react not reflected: %s", w.Body)
	}
	if w = do(t, h, "DELETE", "/api/docs/report/comments/"+c.ID, nil); w.Code != http.StatusOK {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	w = do(t, h, "GET", "/api/docs/report/comments", nil)
	if strings.Contains(w.Body.String(), c.ID) {
		t.Errorf("comment not deleted: %s", w.Body)
	}
}

func TestFrameHeaders(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<html><body>x</body></html>"), "", "", "")
	w := do(t, s.Handler(), "GET", "/api/docs/report/versions/"+v.ID+"/frame", nil)
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("missing nosniff on frame")
	}
	// No sandbox-CSP header: it blocks loading inside an already-sandboxed
	// iframe. Isolation is the host iframe's sandbox attribute.
	if csp := w.Header().Get("Content-Security-Policy"); csp != "" {
		t.Errorf("frame should not send a CSP sandbox header, got %q", csp)
	}
}

func TestPlaceholderServedAtRoot(t *testing.T) {
	s, _ := newTestServer(t)
	w := do(t, s.Handler(), "GET", "/", nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "opendocs") {
		t.Fatalf("placeholder not served: %d", w.Code)
	}
}

func TestDoneSignal(t *testing.T) {
	s, _ := newTestServer(t)
	select {
	case <-s.Done():
		t.Fatal("Done should not be closed before the reviewer submits")
	default:
	}
	// Posting twice must not panic (closing a closed channel).
	for i := range 2 {
		if w := do(t, s.Handler(), "POST", "/api/session/done", nil); w.Code != http.StatusOK {
			t.Fatalf("done #%d: %d", i, w.Code)
		}
	}
	select {
	case <-s.Done():
	default:
		t.Fatal("Done should be closed after the reviewer submits")
	}
}

// A text/plain POST is a CORS "simple" request (no preflight); untrusted doc
// scripts or other sites could use it to write. It must be refused.
func TestFrameRefusesDirectNavigation(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<html><body>secret doc</body></html>"), "", "", "")
	path := "/api/docs/report/versions/" + v.ID + "/frame"

	get := func(dest string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		if dest != "" {
			r.Header.Set("Sec-Fetch-Dest", dest)
		}
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}

	if w := get("document"); w.Code != http.StatusForbidden {
		t.Errorf("top-level navigation: want 403, got %d", w.Code)
	}
	if w := get("iframe"); w.Code != http.StatusOK {
		t.Errorf("iframe load: want 200, got %d", w.Code)
	} else if w.Header().Get("X-Frame-Options") != "SAMEORIGIN" {
		t.Errorf("iframe response missing X-Frame-Options: SAMEORIGIN")
	}
	if w := get("empty"); w.Code != http.StatusOK {
		t.Errorf("fetch() by the host UI: want 200, got %d", w.Code)
	}
	if w := get("object"); w.Code != http.StatusForbidden {
		t.Errorf("<object> embed: want 403, got %d", w.Code)
	}
	if w := get(""); w.Code != http.StatusOK {
		t.Errorf("non-browser client (no Sec-Fetch-Dest): want 200, got %d", w.Code)
	}
}

func TestWritesRequireJSONContentType(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<p>x</p>"), "", "", "")
	h := s.Handler()

	body := `{"body":"sneaky","createdOnVersionId":"` + v.ID + `","anchor":{"quote":"x"}}`
	for _, ct := range []string{"text/plain", "application/x-www-form-urlencoded", ""} {
		r := httptest.NewRequest("POST", "/api/docs/report/comments", strings.NewReader(body))
		if ct != "" {
			r.Header.Set("Content-Type", ct)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusUnsupportedMediaType {
			t.Errorf("Content-Type %q: want 415, got %d", ct, w.Code)
		}
	}
	if comments, _ := doc.ListComments(); len(comments) != 0 {
		t.Errorf("a rejected write must not persist; got %d comments", len(comments))
	}

	// application/json with a charset parameter is still fine.
	r := httptest.NewRequest("POST", "/api/docs/report/comments", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json; charset=utf-8")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("json+charset: want 200, got %d %s", w.Code, w.Body)
	}
}

func TestOversizedBodyRejected(t *testing.T) {
	s, _ := newTestServer(t)
	big := strings.Repeat("a", maxBodyBytes+1024)
	r := httptest.NewRequest("POST", "/api/docs/report/versions", strings.NewReader(`{"html":"`+big+`"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code == http.StatusOK {
		t.Fatalf("oversized body must be rejected, got 200")
	}
}

func TestExplicitPortTakenIsAnError(t *testing.T) {
	a, _ := newTestServer(t)
	port, err := a.Start(0)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Stop()

	b, _ := newTestServer(t)
	if _, err := b.Start(port); err == nil {
		b.Stop()
		t.Fatalf("starting on taken port %d must fail instead of falling back to a random port", port)
	}
}

func TestSessionAPI(t *testing.T) {
	s, _ := newTestServer(t)
	s.SetFocus("report")
	w := do(t, s.Handler(), "GET", "/api/session", nil)
	if !strings.Contains(w.Body.String(), `"focus":"report"`) {
		t.Errorf("session missing focus: %s", w.Body)
	}
}
