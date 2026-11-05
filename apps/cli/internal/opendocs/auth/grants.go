package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// MarshalText / UnmarshalText let a Role round-trip through JSON as its name.
func (r Role) MarshalText() ([]byte, error) { return []byte(r.String()), nil }

func (r *Role) UnmarshalText(b []byte) error {
	v, err := ParseRole(string(b))
	if err != nil {
		return err
	}
	*r = v
	return nil
}

// Grant records that a token (by hash) holds a role on one document.
type Grant struct {
	Doc       string `json:"doc"`
	TokenHash string `json:"tokenHash"`
	Role      Role   `json:"role"`
	Label     string `json:"label,omitempty"` // free-form note, e.g. "for Alice"
	CreatedAt string `json:"createdAt"`
}

// ErrGrantNotFound is returned when revoking a grant that does not exist.
var ErrGrantNotFound = errors.New("auth: grant not found")

// Grants persists capability grants. Implementations must never store a raw
// token — only its hash.
type Grants interface {
	// Mint creates a new grant and returns the raw token. This is the only time
	// the raw token is available.
	Mint(doc string, role Role, label string) (token string, g Grant, err error)
	// Lookup resolves a presented token for a document. ok is false for an
	// unknown token or one minted for a different document.
	Lookup(doc, token string) (g Grant, ok bool)
	List(doc string) ([]Grant, error)
	Revoke(doc, tokenHash string) error
}

// FileGrants is a Grants backed by one JSON file. Suitable for a single-process
// self-hosted proxy; a SQL implementation can replace it for larger deployments.
type FileGrants struct {
	path string
	mu   sync.Mutex
}

// NewFileGrants returns a Grants stored at path (created on first write).
func NewFileGrants(path string) *FileGrants { return &FileGrants{path: path} }

func (f *FileGrants) load() ([]Grant, error) {
	data, err := os.ReadFile(f.path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var gs []Grant
	if err := json.Unmarshal(data, &gs); err != nil {
		return nil, fmt.Errorf("auth: corrupt grants file: %w", err)
	}
	return gs, nil
}

func (f *FileGrants) save(gs []Grant) error {
	if err := os.MkdirAll(filepath.Dir(f.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(gs, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(f.path), ".grants-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), f.path)
}

func (f *FileGrants) Mint(doc string, role Role, label string) (string, Grant, error) {
	if doc == "" {
		return "", Grant{}, fmt.Errorf("auth: empty doc id")
	}
	if role == RoleNone {
		return "", Grant{}, fmt.Errorf("auth: cannot mint a token for role none")
	}
	token, hash, err := NewToken()
	if err != nil {
		return "", Grant{}, err
	}
	g := Grant{Doc: doc, TokenHash: hash, Role: role, Label: label, CreatedAt: time.Now().UTC().Format(time.RFC3339)}

	f.mu.Lock()
	defer f.mu.Unlock()
	gs, err := f.load()
	if err != nil {
		return "", Grant{}, err
	}
	if err := f.save(append(gs, g)); err != nil {
		return "", Grant{}, err
	}
	return token, g, nil
}

func (f *FileGrants) Lookup(doc, token string) (Grant, bool) {
	if token == "" {
		return Grant{}, false
	}
	hash := HashToken(token)
	f.mu.Lock()
	defer f.mu.Unlock()
	gs, err := f.load()
	if err != nil {
		return Grant{}, false // fail closed
	}
	for _, g := range gs {
		if g.TokenHash == hash && g.Doc == doc {
			return g, true
		}
	}
	return Grant{}, false
}

func (f *FileGrants) List(doc string) ([]Grant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	gs, err := f.load()
	if err != nil {
		return nil, err
	}
	var out []Grant
	for _, g := range gs {
		if g.Doc == doc {
			out = append(out, g)
		}
	}
	return out, nil
}

func (f *FileGrants) Revoke(doc, tokenHash string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	gs, err := f.load()
	if err != nil {
		return err
	}
	kept := gs[:0]
	found := false
	for _, g := range gs {
		if g.Doc == doc && g.TokenHash == tokenHash {
			found = true
			continue
		}
		kept = append(kept, g)
	}
	if !found {
		return ErrGrantNotFound
	}
	return f.save(kept)
}
