package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Owners records which documents belong to which signed-in user. A document with
// an owner is still reachable by its capability links; the owner can additionally
// open it as an editor from any device without one.
type Owners interface {
	Add(user, doc string) error
	Owns(user, doc string) bool
	// Docs lists the user's documents, newest first.
	Docs(user string) ([]OwnedDoc, error)
}

// OwnedDoc is one entry of a user's document list.
type OwnedDoc struct {
	Doc       string `json:"id"`
	CreatedAt string `json:"createdAt"`
}

// FileOwners is an Owners backed by one JSON file (the --store fs proxy).
type FileOwners struct {
	path string
	mu   sync.Mutex
}

func NewFileOwners(path string) *FileOwners { return &FileOwners{path: path} }

type ownerRow struct {
	User      string `json:"user"`
	Doc       string `json:"doc"`
	CreatedAt string `json:"createdAt"`
}

func (f *FileOwners) load() ([]ownerRow, error) {
	b, err := os.ReadFile(f.path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var rows []ownerRow
	return rows, json.Unmarshal(b, &rows)
}

func (f *FileOwners) Add(user, doc string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	rows, err := f.load()
	if err != nil {
		return err
	}
	for _, r := range rows {
		if r.User == user && r.Doc == doc {
			return nil
		}
	}
	rows = append(rows, ownerRow{user, doc, time.Now().UTC().Format(time.RFC3339)})
	if err := os.MkdirAll(filepath.Dir(f.path), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(rows, "", "  ")
	tmp := f.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, f.path)
}

func (f *FileOwners) Owns(user, doc string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	rows, _ := f.load()
	for _, r := range rows {
		if r.User == user && r.Doc == doc {
			return true
		}
	}
	return false
}

func (f *FileOwners) Docs(user string) ([]OwnedDoc, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rows, err := f.load()
	if err != nil {
		return nil, err
	}
	out := []OwnedDoc{}
	for _, r := range rows {
		if r.User == user {
			out = append(out, OwnedDoc{r.Doc, r.CreatedAt})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}
