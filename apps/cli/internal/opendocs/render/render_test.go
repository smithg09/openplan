package render

import "strings"

import "testing"

func TestBridgeEmbedded(t *testing.T) {
	if !strings.Contains(BridgeJS(), "opendocs:ready") {
		t.Fatal("bridge.js was not embedded")
	}
}

func TestFrameInjectsIntoHead(t *testing.T) {
	out := string(Frame([]byte("<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>")))
	if !strings.Contains(out, "<script>") || !strings.Contains(out, "opendocs:ready") {
		t.Fatal("bridge script not injected")
	}
	// Injected right after <head>, before the document's own head content.
	headAt := strings.Index(out, "<head>")
	titleAt := strings.Index(out, "<title>")
	scriptAt := strings.Index(out, "<script>")
	if !(headAt < scriptAt && scriptAt < titleAt) {
		t.Errorf("bridge should sit between <head> and <title>: head=%d script=%d title=%d", headAt, scriptAt, titleAt)
	}
}

func TestFrameFallbacks(t *testing.T) {
	cases := []string{
		"<html><body>no head</body></html>",
		"<!doctype html><body>no html tag</body>",
		"<p>bare fragment</p>",
	}
	for _, in := range cases {
		out := string(Frame([]byte(in)))
		if !strings.Contains(out, "opendocs:ready") {
			t.Errorf("bridge not injected for %q", in)
		}
		if !strings.Contains(out, "bare fragment") && strings.Contains(in, "bare fragment") {
			t.Errorf("original content lost for %q", in)
		}
	}
}

func TestStartTagEndIgnoresFalseMatch(t *testing.T) {
	// "<header>" must not be mistaken for "<head>": injection should land in
	// the real <head> (after </header>), before <title>.
	html := "<html><header>nav</header><head><title>t</title></head><body>b</body></html>"
	out := string(Frame([]byte(html)))
	headerCloseAt := strings.Index(strings.ToLower(out), "</header>")
	injectAt := strings.Index(out, "opendocs-bridge-style")
	titleAt := strings.Index(out, "<title>")
	if !(headerCloseAt < injectAt && injectAt < titleAt) {
		t.Errorf("expected injection in real <head> after </header> and before <title>: </header>=%d inject=%d <title>=%d", headerCloseAt, injectAt, titleAt)
	}
}
