package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/server"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// runCLI runs the root command with args and returns what it wrote to stdout.
func runCLI(t *testing.T, args ...string) (string, error) {
	t.Helper()
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w
	rootCmd.SetArgs(args)
	err := rootCmd.Execute()
	w.Close()
	os.Stdout = old
	var buf bytes.Buffer
	io.Copy(&buf, r)
	// cobra keeps flag values between Execute calls in one process; reset them.
	publishCmd.Flags().Set("json", "false")
	publishCmd.Flags().Set("proxy", "")
	publishCmd.Flags().Set("summary", "")
	publishCmd.Flags().Set("label", "")
	return buf.String(), err
}

func proxyServer(t *testing.T) (*httptest.Server, http.Handler) {
	t.Helper()
	key, _ := auth.NewRandomKey()
	signer, _ := auth.NewSigner(key)
	grants := auth.NewFileGrants(filepath.Join(t.TempDir(), "g.json"))
	h := server.NewProxy(store.NewWithBase(t.TempDir()).Backend(), grants, signer, "t").Handler()
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	return ts, h
}

func TestPublishFeedbackRoundTrip(t *testing.T) {
	ts, _ := proxyServer(t)
	t.Setenv("HOME", t.TempDir())
	t.Setenv("OPENDOCS_PROXY", "")
	file := filepath.Join(t.TempDir(), "report.html")
	os.WriteFile(file, []byte("<html><body><p>hello world</p></body></html>"), 0o644)

	// No proxy configured: clear, actionable error.
	if _, err := runCLI(t, "publish", file); err == nil || !strings.Contains(err.Error(), "no proxy configured") {
		t.Fatalf("want no-proxy error, got %v", err)
	}
	// Non-https remote is refused.
	if _, err := runCLI(t, "publish", file, "--proxy", "http://example.com"); err == nil {
		t.Fatal("http to a non-local host must be refused")
	}

	out, err := runCLI(t, "publish", file, "--proxy", ts.URL, "--json", "--label", "v1")
	if err != nil {
		t.Fatal(err)
	}
	var first publishResult
	if err := json.Unmarshal([]byte(out), &first); err != nil {
		t.Fatalf("json: %v: %s", err, out)
	}
	if !first.New || first.Commenter == "" || first.Viewer == "" || first.Editor == "" {
		t.Fatalf("first publish should create the doc and mint links: %+v", first)
	}

	// A commenter link can comment; its token comes from the link fragment.
	tok := first.Commenter[strings.Index(first.Commenter, "#t=")+3:]
	body := strings.NewReader(`{"body":"please clarify","anchor":{"quote":"hello world"},"createdOnVersionId":"` + first.VersionID + `"}`)
	req, _ := http.NewRequest("POST", ts.URL+"/api/docs/"+first.Doc+"/comments", body)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	if resp, err := http.DefaultClient.Do(req); err != nil || resp.StatusCode != 200 {
		t.Fatalf("comment: %v %v", resp, err)
	}

	out, err = runCLI(t, "feedback", file)
	if err != nil {
		t.Fatal(err)
	}
	var fb reviewResult
	if err := json.Unmarshal([]byte(out), &fb); err != nil {
		t.Fatalf("feedback json: %v: %s", err, out)
	}
	if len(fb.Open) != 1 || fb.Open[0].Comment != "please clarify" || fb.Open[0].Quote != "hello world" || fb.VersionID != first.VersionID {
		t.Fatalf("feedback = %+v", fb)
	}

	// Re-publishing the same file adds a version to the same doc, no new links.
	os.WriteFile(file, []byte("<html><body><p>hello world, clarified</p></body></html>"), 0o644)
	out, err = runCLI(t, "publish", file, "--json", "--summary", "clarified")
	if err != nil {
		t.Fatal(err)
	}
	var second publishResult
	json.Unmarshal([]byte(out), &second)
	if second.New || second.Doc != first.Doc || second.VersionID == first.VersionID || second.Editor != "" {
		t.Fatalf("second publish = %+v", second)
	}
}

func TestFeedbackNeedsPublishedFile(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if _, err := runCLI(t, "feedback", filepath.Join(t.TempDir(), "nope.html")); err == nil || !strings.Contains(err.Error(), "has not been published") {
		t.Fatalf("got %v", err)
	}
}
