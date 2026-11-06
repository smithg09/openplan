package remote

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestNewClientValidation(t *testing.T) {
	for _, bad := range []string{"", "ftp://x", "http://example.com", "https://u:p@example.com", "notaurl", "https://"} {
		if _, err := NewClient(bad); err == nil {
			t.Errorf("NewClient(%q) should fail", bad)
		}
	}
	for in, want := range map[string]string{
		"https://docs.example.com/":       "https://docs.example.com",
		"http://localhost:7435":           "http://localhost:7435",
		"http://127.0.0.1:1/ignored/path": "http://127.0.0.1:1",
	} {
		c, err := NewClient(in)
		if err != nil || c.Base != want {
			t.Errorf("NewClient(%q) = %v, %v; want %s", in, c, err, want)
		}
	}
}

func TestShareURLKeepsTokenInFragment(t *testing.T) {
	c, _ := NewClient("https://docs.example.com")
	u := c.ShareURL("abc", "tok-en_1")
	if u != "https://docs.example.com/d/abc#t=tok-en_1" {
		t.Errorf("ShareURL = %s", u)
	}
}

func TestShareURLForHostedProxyPointsAtTheWebApp(t *testing.T) {
	savedU, savedA := HostedURL, HostedAppURL
	t.Cleanup(func() { HostedURL, HostedAppURL = savedU, savedA })
	HostedURL, HostedAppURL = "https://proxy.example.com", "https://docs.example.com/app"
	c, _ := NewClient("https://proxy.example.com")
	want := "https://docs.example.com/app/d/abc?proxy=https%3A%2F%2Fproxy.example.com#t=tok"
	if u := c.ShareURL("abc", "tok"); u != want {
		t.Errorf("ShareURL = %s, want %s", u, want)
	}
	other, _ := NewClient("https://self.hosted.dev")
	if u := other.ShareURL("abc", "tok"); u != "https://self.hosted.dev/d/abc#t=tok" {
		t.Errorf("self-hosted proxy link changed: %s", u)
	}
}

func TestStateProxyResolution(t *testing.T) {
	st := NewStateAt(filepath.Join(t.TempDir(), "s", "state.json"))
	t.Setenv("OPENDOCS_PROXY", "")
	saved := HostedURL
	t.Cleanup(func() { HostedURL = saved })
	HostedURL = ""
	if _, err := st.Proxy(""); !errors.Is(err, ErrNoProxy) {
		t.Fatalf("want ErrNoProxy, got %v", err)
	}
	HostedURL = "https://hosted.example.com"
	if p, _ := st.Proxy(""); p != "https://hosted.example.com" {
		t.Fatalf("with nothing configured the hosted default applies, got %q", p)
	}
	st.SetProxy("https://cfg.example.com")
	if p, _ := st.Proxy(""); p != "https://cfg.example.com" {
		t.Errorf("config = %s", p)
	}
	t.Setenv("OPENDOCS_PROXY", "https://env.example.com")
	if p, _ := st.Proxy(""); p != "https://env.example.com" {
		t.Errorf("env should beat config, got %s", p)
	}
	if p, _ := st.Proxy("https://flag.example.com"); p != "https://flag.example.com" {
		t.Errorf("flag should beat env, got %s", p)
	}
}

func TestStateRememberAndPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	st := NewStateAt(path)
	if _, ok, _ := st.Lookup("/a.html"); ok {
		t.Fatal("empty state should not find anything")
	}
	if err := st.Remember("/a.html", Published{Proxy: "https://p", ID: "id1", EditorToken: "secret"}); err != nil {
		t.Fatal(err)
	}
	p, ok, _ := NewStateAt(path).Lookup("/a.html")
	if !ok || p.ID != "id1" || p.EditorToken != "secret" {
		t.Fatalf("lookup = %+v %v", p, ok)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Errorf("state holds editor tokens; mode = %v, want 0600", info.Mode().Perm())
	}
}
