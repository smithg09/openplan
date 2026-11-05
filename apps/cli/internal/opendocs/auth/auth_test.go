package auth

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// The permission matrix is the heart of the access model; pin it explicitly.
func TestRoleCan(t *testing.T) {
	cases := []struct {
		role Role
		act  Action
		want bool
	}{
		{RoleNone, ActRead, false},
		{RoleNone, ActComment, false},
		{RoleViewer, ActRead, true},
		{RoleViewer, ActComment, false},
		{RoleViewer, ActModifyOwn, false},
		{RoleViewer, ActWrite, false},
		{RoleCommenter, ActRead, true},
		{RoleCommenter, ActComment, true},
		{RoleCommenter, ActModifyOwn, true},
		{RoleCommenter, ActWrite, false},
		{RoleEditor, ActRead, true},
		{RoleEditor, ActComment, true},
		{RoleEditor, ActModifyOwn, true},
		{RoleEditor, ActWrite, true},
		{RoleEditor, Action(99), false}, // unknown actions are denied
	}
	for _, c := range cases {
		if got := c.role.Can(c.act); got != c.want {
			t.Errorf("%s.Can(%d) = %v, want %v", c.role, c.act, got, c.want)
		}
	}
}

func TestParseRole(t *testing.T) {
	for in, want := range map[string]Role{"viewer": RoleViewer, " Commenter ": RoleCommenter, "EDITOR": RoleEditor} {
		if got, err := ParseRole(in); err != nil || got != want {
			t.Errorf("ParseRole(%q) = %v, %v", in, got, err)
		}
	}
	for _, bad := range []string{"", "none", "admin"} {
		if _, err := ParseRole(bad); err == nil {
			t.Errorf("ParseRole(%q) should fail", bad)
		}
	}
}

func TestTokens(t *testing.T) {
	tok, hash, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(tok) < 40 {
		t.Errorf("token too short for 256 bits: %d chars", len(tok))
	}
	if hash == tok || HashToken(tok) != hash {
		t.Error("hash must differ from the token and be reproducible")
	}
	tok2, _, _ := NewToken()
	if tok == tok2 {
		t.Error("tokens must be unique")
	}
}

func TestBearerToken(t *testing.T) {
	cases := map[string]string{
		"Bearer abc":  "abc",
		"bearer abc":  "abc",
		"Bearer  abc": "abc",
		"Bearer ":     "",
		"Basic abc":   "",
		"":            "",
		"abc":         "",
	}
	for in, want := range cases {
		if got := BearerToken(in); got != want {
			t.Errorf("BearerToken(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSigner(t *testing.T) {
	key, _ := NewRandomKey()
	s, err := NewSigner(key)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_700_000_000, 0)
	sig := s.Sign("doc1", "v1", now.Add(time.Minute))

	if !s.Verify("doc1", "v1", sig, now) {
		t.Fatal("valid signature rejected")
	}
	if s.Verify("doc1", "v2", sig, now) {
		t.Error("signature must be bound to the version")
	}
	if s.Verify("doc2", "v1", sig, now) {
		t.Error("signature must be bound to the doc")
	}
	if s.Verify("doc1", "v1", sig, now.Add(2*time.Minute)) {
		t.Error("expired signature accepted")
	}
	// Field-boundary confusion: ("ab","c") must not verify as ("a","bc").
	sig2 := s.Sign("ab", "c", now.Add(time.Minute))
	if s.Verify("a", "bc", sig2, now) {
		t.Error("length-prefixing must prevent doc/version boundary collisions")
	}
	// Tampering with the expiry invalidates the MAC.
	exp, mac, _ := strings.Cut(sig, ".")
	if exp == "" || s.Verify("doc1", "v1", "9999999999."+mac, now) {
		t.Error("extending the expiry must invalidate the signature")
	}
	for _, bad := range []string{"", "garbage", "123.", ".abc", "x.y"} {
		if s.Verify("doc1", "v1", bad, now) {
			t.Errorf("malformed signature %q accepted", bad)
		}
	}
	// A different key must not verify.
	key2, _ := NewRandomKey()
	other, _ := NewSigner(key2)
	if other.Verify("doc1", "v1", sig, now) {
		t.Error("signature verified under a different key")
	}
	if _, err := NewSigner([]byte("short")); err == nil {
		t.Error("short keys must be rejected")
	}
}

func newGrants(t *testing.T) *FileGrants {
	return NewFileGrants(filepath.Join(t.TempDir(), "sub", "grants.json"))
}

func TestGrantsMintLookup(t *testing.T) {
	g := newGrants(t)
	tok, minted, err := g.Mint("docA", RoleCommenter, "for alice")
	if err != nil {
		t.Fatal(err)
	}
	got, ok := g.Lookup("docA", tok)
	if !ok || got.Role != RoleCommenter || got.TokenHash != minted.TokenHash || got.Label != "for alice" {
		t.Fatalf("Lookup = %+v ok=%v", got, ok)
	}
	// Capability is bound to its document.
	if _, ok := g.Lookup("docB", tok); ok {
		t.Error("a token for docA must not authorize docB")
	}
	for _, bad := range []string{"", "wrong", tok + "x"} {
		if _, ok := g.Lookup("docA", bad); ok {
			t.Errorf("bogus token %q accepted", bad)
		}
	}
	if _, _, err := g.Mint("", RoleViewer, ""); err == nil {
		t.Error("empty doc id must be rejected")
	}
	if _, _, err := g.Mint("docA", RoleNone, ""); err == nil {
		t.Error("role none must not be mintable")
	}
}

// The raw token must never touch disk.
func TestGrantsStoreOnlyHashes(t *testing.T) {
	g := newGrants(t)
	tok, minted, _ := g.Mint("docA", RoleEditor, "")
	data, err := os.ReadFile(g.path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), tok) {
		t.Fatal("raw token was written to the grants file")
	}
	if !strings.Contains(string(data), minted.TokenHash) {
		t.Error("token hash should be persisted")
	}
	if info, _ := os.Stat(g.path); info.Mode().Perm() != 0o600 {
		t.Errorf("grants file mode = %v, want 0600", info.Mode().Perm())
	}
	var back []Grant
	if err := json.Unmarshal(data, &back); err != nil || back[0].Role != RoleEditor {
		t.Errorf("role must round-trip through JSON as its name: %v %+v", err, back)
	}
}

func TestGrantsListRevoke(t *testing.T) {
	g := newGrants(t)
	tokA, a, _ := g.Mint("docA", RoleViewer, "")
	g.Mint("docA", RoleCommenter, "")
	tokB, _, _ := g.Mint("docB", RoleEditor, "")

	if list, _ := g.List("docA"); len(list) != 2 {
		t.Fatalf("List(docA) = %d, want 2", len(list))
	}
	if err := g.Revoke("docA", a.TokenHash); err != nil {
		t.Fatal(err)
	}
	if _, ok := g.Lookup("docA", tokA); ok {
		t.Error("revoked token still works")
	}
	if _, ok := g.Lookup("docB", tokB); !ok {
		t.Error("revoking one grant affected another doc")
	}
	if err := g.Revoke("docA", a.TokenHash); !errors.Is(err, ErrGrantNotFound) {
		t.Errorf("double revoke: want ErrGrantNotFound, got %v", err)
	}
	// Cannot revoke another doc's grant by naming it under the wrong doc.
	_, bGrant := func() (string, Grant) { l, _ := g.List("docB"); return "", l[0] }()
	if err := g.Revoke("docA", bGrant.TokenHash); !errors.Is(err, ErrGrantNotFound) {
		t.Errorf("cross-doc revoke must fail, got %v", err)
	}
}

func TestGrantsConcurrentMint(t *testing.T) {
	g := newGrants(t)
	const n = 20
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, _, err := g.Mint("docA", RoleViewer, ""); err != nil {
				t.Errorf("Mint: %v", err)
			}
		}()
	}
	wg.Wait()
	if list, _ := g.List("docA"); len(list) != n {
		t.Fatalf("lost grants under concurrency: want %d, got %d", n, len(list))
	}
}

func TestGrantsCorruptFileFailsClosed(t *testing.T) {
	g := newGrants(t)
	tok, _, _ := g.Mint("docA", RoleEditor, "")
	if err := os.WriteFile(g.path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := g.Lookup("docA", tok); ok {
		t.Fatal("a corrupt grants file must deny access, not allow it")
	}
}
