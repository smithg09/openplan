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
	s := New(st, "proj", "test")
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

func TestFrameHasSandboxCSP(t *testing.T) {
	s, doc := newTestServer(t)
	v, _ := doc.CreateVersion([]byte("<html><body>x</body></html>"), "", "", "")
	w := do(t, s.Handler(), "GET", "/api/docs/report/versions/"+v.ID+"/frame", nil)
	if csp := w.Header().Get("Content-Security-Policy"); csp != "sandbox allow-scripts" {
		t.Errorf("CSP = %q, want sandbox allow-scripts", csp)
	}
}

func TestPlaceholderServedAtRoot(t *testing.T) {
	s, _ := newTestServer(t)
	w := do(t, s.Handler(), "GET", "/", nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "opendocs") {
		t.Fatalf("placeholder not served: %d", w.Code)
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
