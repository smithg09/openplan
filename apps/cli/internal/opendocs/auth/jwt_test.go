package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

type jwtFixture struct {
	priv ed25519.PrivateKey
	kid  string
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func newFixture(kid string) jwtFixture {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	return jwtFixture{priv, kid}
}

func (f jwtFixture) jwks() any {
	return map[string]any{"keys": []map[string]string{{"kty": "OKP", "crv": "Ed25519", "kid": f.kid, "x": b64(f.priv.Public().(ed25519.PublicKey))}}}
}

func (f jwtFixture) token(claims map[string]any, alg string) string {
	h, _ := json.Marshal(map[string]string{"alg": alg, "kid": f.kid, "typ": "JWT"})
	c, _ := json.Marshal(claims)
	signing := b64(h) + "." + b64(c)
	return signing + "." + b64(ed25519.Sign(f.priv, []byte(signing)))
}

func jwksServer(t *testing.T, sets *atomic.Pointer[any], hits *atomic.Int32) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		json.NewEncoder(w).Encode(*sets.Load())
	}))
	t.Cleanup(ts.Close)
	return ts
}

func TestJWTVerifier(t *testing.T) {
	f := newFixture("k1")
	var sets atomic.Pointer[any]
	var hits atomic.Int32
	set := f.jwks()
	sets.Store(&set)
	ts := jwksServer(t, &sets, &hits)
	v := NewJWTVerifier(ts.URL, "")
	now := time.Now()
	good := map[string]any{"sub": "user-1", "email": "a@b.co", "name": "Ada", "exp": now.Add(10 * time.Minute).Unix()}

	u, err := v.Verify(f.token(good, "EdDSA"), now)
	if err != nil || u.Sub != "user-1" || u.Email != "a@b.co" || u.Name != "Ada" {
		t.Fatalf("valid token = %+v, %v", u, err)
	}
	if _, err := v.Verify(f.token(good, "EdDSA"), now); err != nil || hits.Load() != 1 {
		t.Errorf("JWKS should be cached: hits=%d err=%v", hits.Load(), err)
	}

	bad := map[string]string{
		"expired":     f.token(map[string]any{"sub": "u", "exp": now.Add(-time.Hour).Unix()}, "EdDSA"),
		"alg none":    f.token(good, "none"),
		"alg HS256":   f.token(good, "HS256"),
		"no sub":      f.token(map[string]any{"exp": now.Add(time.Hour).Unix()}, "EdDSA"),
		"no exp":      f.token(map[string]any{"sub": "u"}, "EdDSA"),
		"not yet":     f.token(map[string]any{"sub": "u", "exp": now.Add(time.Hour).Unix(), "nbf": now.Add(time.Hour).Unix()}, "EdDSA"),
		"garbage":     "a.b.c",
		"empty":       "",
		"two parts":   "a.b",
		"foreign key": newFixture("k1").token(good, "EdDSA"), // right kid, wrong signature
	}
	for name, tok := range bad {
		if _, err := v.Verify(tok, now); err == nil {
			t.Errorf("%s: token accepted", name)
		}
	}
}

func TestJWTVerifierRotationAndIssuer(t *testing.T) {
	old, rotated := newFixture("old"), newFixture("new")
	var sets atomic.Pointer[any]
	var hits atomic.Int32
	set := old.jwks()
	sets.Store(&set)
	ts := jwksServer(t, &sets, &hits)
	v := NewJWTVerifier(ts.URL, "https://issuer.example")
	now := time.Now()
	claims := func(iss string) map[string]any {
		return map[string]any{"sub": "u", "iss": iss, "exp": now.Add(time.Hour).Unix()}
	}
	if _, err := v.Verify(old.token(claims("https://issuer.example"), "EdDSA"), now); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(old.token(claims("https://evil.example"), "EdDSA"), now); err == nil {
		t.Error("wrong issuer accepted")
	}
	// A key rotation: unknown kid triggers a refetch, but not more than once per interval.
	set2 := rotated.jwks()
	sets.Store(&set2)
	v.fetched = time.Now().Add(-time.Minute)
	if _, err := v.Verify(rotated.token(claims("https://issuer.example"), "EdDSA"), now); err != nil {
		t.Errorf("rotated key not picked up: %v", err)
	}
	before := hits.Load()
	unknown := newFixture("ghost")
	for i := 0; i < 5; i++ {
		v.Verify(unknown.token(claims("https://issuer.example"), "EdDSA"), now)
	}
	if hits.Load() != before {
		t.Errorf("unknown kids must not hammer the JWKS endpoint (%d extra fetches)", hits.Load()-before)
	}
}

func TestFileOwners(t *testing.T) {
	o := NewFileOwners(t.TempDir() + "/owners.json")
	if o.Owns("u1", "d1") {
		t.Fatal("owns before add")
	}
	for _, p := range [][2]string{{"u1", "d1"}, {"u1", "d1"}, {"u1", "d2"}, {"u2", "d3"}} {
		if err := o.Add(p[0], p[1]); err != nil {
			t.Fatal(err)
		}
	}
	docs, _ := o.Docs("u1")
	if len(docs) != 2 {
		t.Errorf("u1 docs = %v, want 2 (no duplicates, no other users')", docs)
	}
	if !o.Owns("u2", "d3") || o.Owns("u2", "d1") {
		t.Error("ownership leaked across users")
	}
}
