package server

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
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

// accountsEnv is a proxy with optional sign-in enabled against a fake JWKS.
type accountsEnv struct {
	*proxyEnv
	priv ed25519.PrivateKey
}

func b64u(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func newAccountsEnv(t *testing.T) *accountsEnv {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{"kty": "OKP", "crv": "Ed25519", "kid": "k", "x": b64u(pub)}}})
	}))
	t.Cleanup(jwks.Close)
	key, _ := auth.NewRandomKey()
	signer, _ := auth.NewSigner(key)
	grants := auth.NewFileGrants(filepath.Join(t.TempDir(), "grants.json"))
	owners := auth.NewFileOwners(filepath.Join(t.TempDir(), "owners.json"))
	st := store.NewWithBase(t.TempDir()).Backend()
	h := NewProxy(st, grants, signer, "test").WithAccounts(auth.NewJWTVerifier(jwks.URL, ""), owners).Handler()
	return &accountsEnv{&proxyEnv{t: t, h: h, signer: signer}, priv}
}

func (e *accountsEnv) jwt(sub, name string) string {
	hdr, _ := json.Marshal(map[string]string{"alg": "EdDSA", "kid": "k"})
	cl, _ := json.Marshal(map[string]any{"sub": sub, "name": name, "email": sub + "@example.com", "exp": time.Now().Add(10 * time.Minute).Unix()})
	signing := b64u(hdr) + "." + b64u(cl)
	return signing + "." + b64u(ed25519.Sign(e.priv, []byte(signing)))
}

// as performs a request with an optional capability token and optional user JWT.
func (e *accountsEnv) as(token, user, method, path string, body any) *httptest.ResponseRecorder {
	e.t.Helper()
	var r *http.Request
	if body != nil {
		buf, _ := json.Marshal(body)
		r = httptest.NewRequest(method, path, bytesReader(buf))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if method != "GET" {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if user != "" {
		r.Header.Set(userHeader, user)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, r)
	return w
}

func TestAccountsScopeDocumentsToTheirOwner(t *testing.T) {
	e := newAccountsEnv(t)
	alice, bob := e.jwt("alice", "Alice A"), e.jwt("bob", "Bob B")

	// Alice publishes while signed in; Bob publishes anonymously.
	a := decode[map[string]any](t, e.as("", alice, "POST", "/api/docs", map[string]string{"html": "<p>alice</p>"}))
	anon := decode[map[string]any](t, e.as("", "", "POST", "/api/docs", map[string]string{"html": "<p>anon</p>"}))
	aid := a["id"].(string)

	// Her list has exactly her document; Bob's is empty; anonymous gets 401.
	mine := decode[struct{ Docs []auth.OwnedDoc }](t, e.as("", alice, "GET", "/api/me/docs", nil))
	if len(mine.Docs) != 1 || mine.Docs[0].Doc != aid {
		t.Errorf("alice's docs = %+v", mine.Docs)
	}
	if bobs := decode[struct{ Docs []auth.OwnedDoc }](t, e.as("", bob, "GET", "/api/me/docs", nil)); len(bobs.Docs) != 0 {
		t.Errorf("bob sees %+v", bobs.Docs)
	}
	if w := e.as("", "", "GET", "/api/me/docs", nil); w.Code != 401 {
		t.Errorf("anonymous /api/me/docs = %d, want 401", w.Code)
	}

	// Alice opens her document as editor with no link at all; Bob and anonymous cannot.
	if w := e.as("", alice, "GET", "/api/docs/"+aid+"/access", nil); w.Code != 200 || !contains(w.Body.String(), `"editor"`) {
		t.Errorf("owner access = %d %s", w.Code, w.Body)
	}
	for who, tok := range map[string]string{"bob": bob, "anonymous": ""} {
		if w := e.as("", tok, "GET", "/api/docs/"+aid+"/access", nil); w.Code != 401 {
			t.Errorf("%s without a link got %d, want 401", who, w.Code)
		}
	}
	// An anonymous document is not Alice's just because she is signed in.
	if w := e.as("", alice, "GET", "/api/docs/"+anon["id"].(string)+"/access", nil); w.Code != 401 {
		t.Errorf("alice on an anonymous doc without its link = %d, want 401", w.Code)
	}
}

func TestAccountsCommentsAreAttributedAndFollowTheUser(t *testing.T) {
	e := newAccountsEnv(t)
	alice := e.jwt("alice", "Alice A")
	created := decode[map[string]any](t, e.as("", "", "POST", "/api/docs", map[string]string{"html": "<p>hello world</p>"}))
	id, editor := created["id"].(string), created["editorToken"].(string)
	share := decode[map[string]any](t, e.as(editor, "", "POST", "/api/docs/"+id+"/shares", map[string]string{"role": "commenter"}))
	link := share["token"].(string)

	// Signed in, commenting through a link: the verified name replaces the typed one.
	w := e.as(link, alice, "POST", "/api/docs/"+id+"/comments", map[string]any{"body": "hi", "author": "Someone Else", "anchor": map[string]any{"quote": "hello", "start": 3, "end": 8}})
	if w.Code != 200 {
		t.Fatalf("comment = %d %s", w.Code, w.Body)
	}
	if got := decode[struct{ Author string }](t, w).Author; got != "Alice A" {
		t.Errorf("author = %q, want the verified name", got)
	}
	// Anonymous comments keep their typed name.
	w = e.as(link, "", "POST", "/api/docs/"+id+"/comments", map[string]any{"body": "yo", "author": "Typed Name"})
	if got := decode[struct{ Author string }](t, w).Author; got != "Typed Name" {
		t.Errorf("anonymous author = %q", got)
	}

	// "mine" follows the account: same comment, no link needed once she owns the doc.
	if w := e.as(editor, alice, "POST", "/api/docs/"+id+"/claim", map[string]string{}); w.Code != 200 {
		t.Fatalf("claim = %d %s", w.Code, w.Body)
	}
	list := decode[struct{ Comments []publicComment }](t, e.as("", alice, "GET", "/api/docs/"+id+"/comments", nil))
	mineCount := 0
	for _, c := range list.Comments {
		if c.Mine {
			mineCount++
		}
	}
	if len(list.Comments) != 2 || mineCount != 1 {
		t.Errorf("comments=%d mine=%d, want 2 and 1", len(list.Comments), mineCount)
	}
}

func TestAccountsAreOptionalAndTokensCannotBeForged(t *testing.T) {
	// Without accounts configured, the header is ignored and /api/me says so.
	plain := newProxyEnv(t)
	r := httptest.NewRequest("GET", "/api/me", nil)
	w := httptest.NewRecorder()
	plain.h.ServeHTTP(w, r)
	if w.Code != 200 || !contains(w.Body.String(), `"enabled":false`) {
		t.Errorf("/api/me without accounts = %d %s", w.Code, w.Body)
	}

	e := newAccountsEnv(t)
	// A token for the wrong key, an expired one and junk are all just "anonymous".
	_, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	forged := (&accountsEnv{e.proxyEnv, otherPriv}).jwt("alice", "Mallory")
	for name, tok := range map[string]string{"forged": forged, "junk": "not.a.jwt"} {
		if w := e.as("", tok, "GET", "/api/me", nil); w.Code != 401 {
			t.Errorf("%s /api/me = %d, want 401", name, w.Code)
		}
	}
	if w := e.as("", e.jwt("alice", "Alice"), "GET", "/api/me", nil); w.Code != 200 || !contains(w.Body.String(), `"alice@example.com"`) {
		t.Errorf("valid /api/me = %d %s", w.Code, w.Body)
	}
	// The user header is allowed through CORS preflight.
	if got := corsAllowedHeaders(t); !contains(got, "X-Opendocs-User") {
		t.Errorf("CORS allow-headers = %q", got)
	}
}

func corsAllowedHeaders(t *testing.T) string {
	t.Helper()
	key, _ := auth.NewRandomKey()
	signer, _ := auth.NewSigner(key)
	h := NewProxy(store.NewWithBase(t.TempDir()).Backend(), auth.NewFileGrants(filepath.Join(t.TempDir(), "g.json")), signer, "t").WithCORS([]string{"https://app.example"}).Handler()
	r := httptest.NewRequest("OPTIONS", "/api/docs", nil)
	r.Header.Set("Origin", "https://app.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Header().Get("Access-Control-Allow-Headers")
}

func contains(s, sub string) bool        { return strings.Contains(s, sub) }
func bytesReader(b []byte) *bytes.Reader { return bytes.NewReader(b) }
