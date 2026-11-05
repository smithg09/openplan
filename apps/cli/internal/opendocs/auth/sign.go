package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Signer issues and verifies short-lived, version-scoped frame URLs.
//
// Why this exists: the review iframe cannot send an Authorization header, and
// the document inside it is untrusted script that can read its own
// location.href. So a capability token must never go in the frame URL. Instead
// an authenticated API call returns a signature that is valid only for one
// (doc, version) and expires quickly; leaking it exposes one version briefly,
// never write access.
type Signer struct{ key []byte }

// NewSigner returns a Signer using key (at least 16 bytes).
func NewSigner(key []byte) (*Signer, error) {
	if len(key) < 16 {
		return nil, fmt.Errorf("auth: signing key must be at least 16 bytes")
	}
	return &Signer{key: key}, nil
}

// NewRandomKey returns 32 random bytes suitable for NewSigner.
func NewRandomKey() ([]byte, error) {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		return nil, err
	}
	return k, nil
}

func (s *Signer) mac(doc, version string, exp int64) []byte {
	m := hmac.New(sha256.New, s.key)
	// Length-prefix the fields so ("ab","c") and ("a","bc") cannot collide.
	fmt.Fprintf(m, "%d:%s|%d:%s|%d", len(doc), doc, len(version), version, exp)
	return m.Sum(nil)
}

// Sign returns "<unix-expiry>.<mac>" valid for doc+version until exp.
func (s *Signer) Sign(doc, version string, exp time.Time) string {
	e := exp.Unix()
	return strconv.FormatInt(e, 10) + "." + base64.RawURLEncoding.EncodeToString(s.mac(doc, version, e))
}

// Verify reports whether sig is a valid, unexpired signature for doc+version.
func (s *Signer) Verify(doc, version, sig string, now time.Time) bool {
	expStr, macStr, ok := strings.Cut(sig, ".")
	if !ok {
		return false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || now.Unix() > exp {
		return false
	}
	got, err := base64.RawURLEncoding.DecodeString(macStr)
	if err != nil {
		return false
	}
	return hmac.Equal(got, s.mac(doc, version, exp))
}
