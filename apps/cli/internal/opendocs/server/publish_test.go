package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/remote"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// A local server publishing to a real proxy handler.
func localWithProxy(t *testing.T) (*Server, *httptest.Server, *remote.State) {
	t.Helper()
	e := newProxyEnv(t)
	ts := httptest.NewServer(e.h)
	t.Cleanup(ts.Close)
	s, doc := newTestServer(t)
	doc.CreateVersion([]byte("<p>hello share</p>"), "", "v1", "")
	st := remote.NewStateAt(filepath.Join(t.TempDir(), "state.json"))
	s.SetState(st)
	return s, ts, st
}

func TestLocalSettingsProxy(t *testing.T) {
	s, _, _ := localWithProxy(t)
	h := s.Handler()
	t.Setenv("OPENDOCS_PROXY", "")
	noHosted(t)

	if w := do(t, h, "GET", "/api/settings", nil); !strings.Contains(w.Body.String(), `"proxy":""`) {
		t.Errorf("unset proxy = %s", w.Body)
	}
	if w := do(t, h, "POST", "/api/settings", map[string]string{"proxy": "http://example.com"}); w.Code != 400 {
		t.Errorf("non-https remote proxy = %d, want 400", w.Code)
	}
	if w := do(t, h, "POST", "/api/settings", map[string]string{"proxy": "https://docs.example.com/"}); w.Code != 200 || !strings.Contains(w.Body.String(), `"https://docs.example.com"`) {
		t.Errorf("set proxy = %d %s", w.Code, w.Body)
	}
	if w := do(t, h, "GET", "/api/settings", nil); !strings.Contains(w.Body.String(), "https://docs.example.com") {
		t.Errorf("proxy not persisted: %s", w.Body)
	}
	if w := do(t, h, "POST", "/api/settings", map[string]string{"proxy": ""}); w.Code != 200 {
		t.Errorf("clear = %d", w.Code)
	}
}

func TestLocalPublishAndShareFlow(t *testing.T) {
	s, ts, st := localWithProxy(t)
	h := s.Handler()
	t.Setenv("OPENDOCS_PROXY", "")
	noHosted(t)

	// Before publishing: not published, links refused, publish needs a proxy.
	if w := do(t, h, "GET", "/api/docs/report/remote", nil); !strings.Contains(w.Body.String(), `"published":false`) {
		t.Fatalf("status = %s", w.Body)
	}
	if w := do(t, h, "POST", "/api/docs/report/remote/links", map[string]string{"role": "viewer"}); w.Code != 400 {
		t.Errorf("links before publish = %d, want 400", w.Code)
	}
	if w := do(t, h, "POST", "/api/docs/report/publish", map[string]string{}); w.Code != 400 {
		t.Errorf("publish with no proxy = %d, want 400", w.Code)
	}

	w := do(t, h, "POST", "/api/docs/report/publish", map[string]string{"proxy": ts.URL})
	if w.Code != 200 {
		t.Fatalf("publish = %d %s", w.Code, w.Body)
	}
	first := decode[map[string]any](t, w)
	if first["new"] != true || first["id"] == "" {
		t.Fatalf("first publish = %v", first)
	}
	if strings.Contains(w.Body.String(), "editorToken") {
		t.Error("the editor token must never be sent to the browser")
	}
	p, ok, _ := st.Lookup("doc:proj/report")
	if !ok || p.EditorToken == "" {
		t.Fatalf("editor token should be kept in local state: %+v", p)
	}

	// A viewer link actually works against the proxy; a commenter link can comment.
	link := decode[map[string]string](t, do(t, h, "POST", "/api/docs/report/remote/links", map[string]string{"role": "viewer"}))["link"]
	tok := link[strings.Index(link, "#t=")+3:]
	if !strings.HasPrefix(link, ts.URL+"/d/"+first["id"].(string)+"#t=") {
		t.Errorf("link = %s", link)
	}
	// The minted token really is a viewer on the proxy.
	areq, _ := http.NewRequest("GET", ts.URL+"/api/docs/"+first["id"].(string)+"/access", nil)
	areq.Header.Set("Authorization", "Bearer "+tok)
	ares, err := http.DefaultClient.Do(areq)
	if err != nil {
		t.Fatal(err)
	}
	defer ares.Body.Close()
	if ares.StatusCode != 200 {
		t.Errorf("viewer link rejected by the proxy: %d", ares.StatusCode)
	}
	if w := do(t, h, "POST", "/api/docs/report/remote/links", map[string]string{"role": "nope"}); w.Code != 400 {
		t.Errorf("bad role = %d, want 400", w.Code)
	}

	// Status now reports the proxy and id; publishing again adds a version, no new doc.
	if w := do(t, h, "GET", "/api/docs/report/remote", nil); !strings.Contains(w.Body.String(), `"published":true`) {
		t.Errorf("status = %s", w.Body)
	}
	second := decode[map[string]any](t, do(t, h, "POST", "/api/docs/report/publish", map[string]string{}))
	if second["new"] != false || second["id"] != first["id"] || second["versionId"] == "" {
		t.Errorf("republish = %v", second)
	}
}

func TestPublishRoutesAbsentInProxyMode(t *testing.T) {
	e := newProxyEnv(t)
	doc, editor, _, _ := e.setup()
	for _, p := range []string{"/api/settings"} {
		if w := e.call(editor, "GET", p, nil); strings.Contains(w.Body.String(), `"proxy"`) {
			t.Errorf("%s must not exist on the proxy: %s", p, w.Body)
		}
	}
	if w := e.call(editor, "POST", "/api/docs/"+doc+"/publish", map[string]string{}); strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
		t.Errorf("the proxy must not expose local publish: %s", w.Body)
	}
}

// noHosted blanks the built-in hosted default so tests exercise the "nothing configured" paths.
func noHosted(t *testing.T) {
	t.Helper()
	saved := remote.HostedURL
	remote.HostedURL = ""
	t.Cleanup(func() { remote.HostedURL = saved })
}

func TestPublishCarriesLocalCommentsAcrossOnce(t *testing.T) {
	s, ts, st := localWithProxy(t)
	h := s.Handler()
	t.Setenv("OPENDOCS_PROXY", "")
	noHosted(t)

	d := s.store.Doc("proj", "report")
	root, err := d.AddComment(store.Comment{Body: "why eleven minutes?", Type: "question", Author: "Smith",
		Anchor: &store.Anchor{Quote: "hello share", Start: 3, End: 14}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.AddComment(store.Comment{Body: "the lock", Author: "Smith", RootCommentID: root.ID}); err != nil {
		t.Fatal(err)
	}

	first := decode[map[string]any](t, do(t, h, "POST", "/api/docs/report/publish", map[string]string{"proxy": ts.URL}))
	if first["comments"] != float64(2) {
		t.Fatalf("first publish synced %v comments, want 2 (%v)", first["comments"], first)
	}
	p, _, _ := st.Lookup("doc:proj/report")
	c, _ := remote.NewClient(ts.URL)
	remoteComments, err := c.Comments(p.ID, p.EditorToken)
	if err != nil || len(remoteComments) != 2 {
		t.Fatalf("remote comments = %v, %v", remoteComments, err)
	}
	var rRoot, rReply store.Comment
	for _, rc := range remoteComments {
		if rc.RootCommentID == "" {
			rRoot = rc
		} else {
			rReply = rc
		}
	}
	if rRoot.Type != "question" || rRoot.Anchor == nil || rRoot.Anchor.Quote != "hello share" || rReply.RootCommentID != rRoot.ID {
		t.Errorf("thread not preserved: root=%+v reply=%+v", rRoot, rReply)
	}

	// Publishing again must not duplicate them; a new local comment goes across.
	if _, err := d.AddComment(store.Comment{Body: "new one", Author: "Smith", Anchor: &store.Anchor{Quote: "hello", Start: 3, End: 8}}); err != nil {
		t.Fatal(err)
	}
	second := decode[map[string]any](t, do(t, h, "POST", "/api/docs/report/publish", map[string]string{}))
	if second["comments"] != float64(1) {
		t.Errorf("republish synced %v comments, want 1", second["comments"])
	}
	if all, _ := c.Comments(p.ID, p.EditorToken); len(all) != 3 {
		t.Errorf("remote has %d comments after republish, want 3", len(all))
	}
}
