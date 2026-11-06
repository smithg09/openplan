package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// stream opens /events and returns a channel of decoded events plus a cancel.
func stream(t *testing.T, url, token string) (<-chan map[string]any, *http.Response, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	out := make(chan map[string]any, 32)
	go func() {
		defer close(out)
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			if line := sc.Text(); strings.HasPrefix(line, "data: ") {
				var ev map[string]any
				if json.Unmarshal([]byte(line[6:]), &ev) == nil {
					out <- ev
				}
			}
		}
	}()
	t.Cleanup(func() { cancel(); resp.Body.Close() })
	return out, resp, cancel
}

func waitFor(t *testing.T, ch <-chan map[string]any, typ string) map[string]any {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatalf("stream closed while waiting for %q", typ)
			}
			if ev["type"] == typ {
				return ev
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q event", typ)
		}
	}
}

func TestLiveEventsReachOtherClients(t *testing.T) {
	e := newProxyEnv(t)
	ts := httptest.NewServer(e.h)
	t.Cleanup(ts.Close) // registered first => runs after the streams are cancelled
	doc, editor, commenter, viewer := e.setup()
	base := ts.URL + "/api/docs/" + doc

	// A viewer can listen; no token cannot.
	if _, resp, _ := stream(t, base+"/events", ""); resp.StatusCode != 401 {
		t.Fatalf("no token = %d, want 401", resp.StatusCode)
	}
	vch, resp, _ := stream(t, base+"/events", viewer)
	if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("viewer stream = %d %s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	if ev := waitFor(t, vch, "presence"); ev["count"].(float64) != 1 {
		t.Errorf("presence = %v, want 1", ev)
	}

	// A comment by someone else reaches the viewer — as a bare "changed" signal.
	post := func(token, path string, body string) int {
		req, _ := http.NewRequest("POST", base+path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		r, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	if c := post(commenter, "/comments", `{"body":"secret words"}`); c != 200 {
		t.Fatalf("comment = %d", c)
	}
	ev := waitFor(t, vch, "comments")
	if len(ev) != 1 {
		t.Errorf("event must carry no content, got %v", ev)
	}

	// New versions are signalled too; a forbidden write signals nothing.
	if c := post(editor, "/versions", `{"html":"<p>v2</p>"}`); c != 200 {
		t.Fatalf("version = %d", c)
	}
	waitFor(t, vch, "versions")
	if c := post(commenter, "/versions", `{"html":"<p>nope</p>"}`); c != 403 {
		t.Fatalf("forbidden version = %d", c)
	}
	select {
	case ev := <-vch:
		t.Errorf("a rejected write must not notify, got %v", ev)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestLiveEventsAreScopedPerDoc(t *testing.T) {
	e := newProxyEnv(t)
	ts := httptest.NewServer(e.h)
	t.Cleanup(ts.Close) // registered first => runs after the streams are cancelled
	d1, ed1, _, _ := e.setup()
	d2, ed2, _, _ := e.setup()
	ch1, _, _ := stream(t, ts.URL+"/api/docs/"+d1+"/events", ed1)
	waitFor(t, ch1, "presence")

	req, _ := http.NewRequest("POST", ts.URL+"/api/docs/"+d2+"/comments", strings.NewReader(`{"body":"x"}`))
	req.Header.Set("Authorization", "Bearer "+ed2)
	req.Header.Set("Content-Type", "application/json")
	r, _ := http.DefaultClient.Do(req)
	r.Body.Close()

	select {
	case ev := <-ch1:
		t.Errorf("doc1 listener received doc2 activity: %v", ev)
	case <-time.After(300 * time.Millisecond):
	}
	// And a token for doc1 cannot listen to doc2.
	if _, resp, _ := stream(t, ts.URL+"/api/docs/"+d2+"/events", ed1); resp.StatusCode != 401 {
		t.Errorf("cross-doc listen = %d, want 401", resp.StatusCode)
	}
}

func TestLivePresenceCountsAndSubscriberCap(t *testing.T) {
	e := newProxyEnv(t)
	ts := httptest.NewServer(e.h)
	t.Cleanup(ts.Close) // registered first => runs after the streams are cancelled
	doc, editor, _, viewer := e.setup()
	url := ts.URL + "/api/docs/" + doc + "/events"

	ch1, _, _ := stream(t, url, editor)
	waitFor(t, ch1, "presence")
	_, _, cancel2 := stream(t, url, viewer)
	if ev := waitFor(t, ch1, "presence"); ev["count"].(float64) != 2 {
		t.Errorf("after second viewer joined: %v", ev)
	}
	cancel2()
	// Leaving is noticed once the server sees the closed connection.
	deadline := time.After(3 * time.Second)
	for {
		select {
		case ev := <-ch1:
			if ev["type"] == "presence" && ev["count"].(float64) == 1 {
				goto capTest
			}
		case <-deadline:
			t.Fatal("presence never dropped back to 1")
		}
	}
capTest:
	h := newHub()
	for i := 0; i < maxSubscribersPerDoc; i++ {
		if _, ok := h.join("d"); !ok {
			t.Fatalf("join %d refused early", i)
		}
	}
	if _, ok := h.join("d"); ok {
		t.Error("subscriber cap not enforced")
	}
	if _, ok := h.join("other"); !ok {
		t.Error("cap is per document")
	}
}

func TestSubscriberCoalescesPending(t *testing.T) {
	s := newSubscriber()
	for range 50 {
		s.notify("comments")
	}
	s.notify("versions")
	got := s.take()
	if len(got) != 2 {
		t.Errorf("take = %v, want comments+versions once each", got)
	}
	if len(s.take()) != 0 {
		t.Error("take must clear pending")
	}
}

func TestLocalModeEventsWork(t *testing.T) {
	s, doc := newTestServer(t)
	doc.CreateVersion([]byte("<p>x</p>"), "", "", "")
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close) // registered first => runs after the streams are cancelled
	ch, resp, _ := stream(t, ts.URL+"/api/docs/report/events", "")
	if resp.StatusCode != 200 {
		t.Fatalf("local events = %d", resp.StatusCode)
	}
	waitFor(t, ch, "presence")
	req, _ := http.NewRequest("POST", ts.URL+"/api/docs/report/comments", strings.NewReader(`{"body":"hi"}`))
	req.Header.Set("Content-Type", "application/json")
	r, _ := http.DefaultClient.Do(req)
	r.Body.Close()
	waitFor(t, ch, "comments")
}
