package auth

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Optional accounts. When a proxy is given a JWKS URL (Neon Auth, i.e. managed
// Better Auth, signs its session tokens with Ed25519), callers may send such a
// token in addition to — never instead of — a capability link. The proxy only
// ever reads who the caller is from a verified token; there is no password or
// session state here.

// User is a verified account holder.
type User struct {
	Sub   string // stable id
	Email string
	Name  string
}

// ErrBadToken is returned for any token that is missing, malformed, expired or
// not signed by a known key.
var ErrBadToken = errors.New("auth: invalid user token")

const (
	clockSkew      = 60 * time.Second
	jwksMinRefetch = 30 * time.Second
	maxTokenLen    = 8 << 10
)

// JWTVerifier verifies EdDSA JSON Web Tokens against a remote JWKS.
type JWTVerifier struct {
	jwksURL string
	issuer  string // "" = not pinned (the JWKS is already specific to one Auth project)
	client  *http.Client

	mu      sync.Mutex
	keys    map[string]ed25519.PublicKey
	fetched time.Time
}

// NewJWTVerifier returns a verifier for tokens signed by the keys at jwksURL.
// A non-empty issuer must match the token's "iss" exactly.
func NewJWTVerifier(jwksURL, issuer string) *JWTVerifier {
	return &JWTVerifier{jwksURL: jwksURL, issuer: issuer, client: &http.Client{Timeout: 10 * time.Second}}
}

type jwk struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	Kid string `json:"kid"`
	X   string `json:"x"`
}

func (v *JWTVerifier) refresh() error {
	resp, err := v.client.Get(v.jwksURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("jwks: %s", resp.Status)
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&set); err != nil {
		return err
	}
	keys := map[string]ed25519.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "OKP" || k.Crv != "Ed25519" {
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil || len(raw) != ed25519.PublicKeySize {
			continue
		}
		keys[k.Kid] = ed25519.PublicKey(raw)
	}
	v.keys, v.fetched = keys, time.Now()
	return nil
}

// key finds the public key for kid, refetching the JWKS (at most every
// jwksMinRefetch) when the kid is unknown, so key rotation works.
func (v *JWTVerifier) key(kid string) (ed25519.PublicKey, bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if k, ok := v.keys[kid]; ok {
		return k, true
	}
	if v.keys == nil || time.Since(v.fetched) > jwksMinRefetch {
		if err := v.refresh(); err != nil {
			return nil, false
		}
	}
	k, ok := v.keys[kid]
	return k, ok
}

// Verify checks token's signature and time claims and returns who it is for.
func (v *JWTVerifier) Verify(token string, now time.Time) (User, error) {
	if token == "" || len(token) > maxTokenLen {
		return User{}, ErrBadToken
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return User{}, ErrBadToken
	}
	dec := func(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }
	hb, err := dec(parts[0])
	if err != nil {
		return User{}, ErrBadToken
	}
	var h struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(hb, &h) != nil || h.Alg != "EdDSA" { // never "none", never HS*
		return User{}, ErrBadToken
	}
	pub, ok := v.key(h.Kid)
	if !ok {
		return User{}, ErrBadToken
	}
	sig, err := dec(parts[2])
	if err != nil || !ed25519.Verify(pub, []byte(parts[0]+"."+parts[1]), sig) {
		return User{}, ErrBadToken
	}
	pb, err := dec(parts[1])
	if err != nil {
		return User{}, ErrBadToken
	}
	var c struct {
		Iss   string  `json:"iss"`
		Sub   string  `json:"sub"`
		Exp   float64 `json:"exp"`
		Nbf   float64 `json:"nbf"`
		Email string  `json:"email"`
		Name  string  `json:"name"`
	}
	if json.Unmarshal(pb, &c) != nil || c.Sub == "" || c.Exp == 0 {
		return User{}, ErrBadToken
	}
	if now.After(time.Unix(int64(c.Exp), 0).Add(clockSkew)) {
		return User{}, ErrBadToken
	}
	if c.Nbf != 0 && now.Add(clockSkew).Before(time.Unix(int64(c.Nbf), 0)) {
		return User{}, ErrBadToken
	}
	if v.issuer != "" && c.Iss != v.issuer {
		return User{}, ErrBadToken
	}
	return User{Sub: c.Sub, Email: c.Email, Name: c.Name}, nil
}
