// Package store is opendocs' local persistence layer: content-addressed,
// immutable HTML document versions with a parent chain, doc-scoped comments,
// and optimistic-concurrency writes.
//
// Layout under ~/.opendocs/docs/<project>/<doc>/:
//
//	versions/<contentHash>.html   immutable snapshot, named by sha256 of its bytes
//	versions.json                 manifest: ordered version entries + current head
//	comments.json                 doc-scoped comments (each carries its anchor + origin version)
//
// A version's file is content-addressed, so republishing identical bytes reuses
// the same file; each manifest entry still gets its own id, so the parent chain
// and labels are preserved even when content repeats. This replaces openplan's
// brittle sequential vN.md probing.
package store

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ErrConflict is returned by writes whose expectedHead no longer matches the
// document's current head — the optimistic-concurrency (If-Match) guard.
var ErrConflict = errors.New("opendocs: version conflict (document changed since expected head)")

// ErrNotFound is returned when a requested version or comment does not exist.
var ErrNotFound = errors.New("opendocs: not found")

// Version is one immutable snapshot in a document's history.
type Version struct {
	ID          string `json:"id"`                // unique per entry (even if content repeats)
	Parent      string `json:"parent,omitempty"`  // id of the version this was created from
	ContentHash string `json:"contentHash"`       // sha256 of the HTML bytes (also the filename)
	CreatedAt   string `json:"createdAt"`         // RFC3339 UTC
	Label       string `json:"label,omitempty"`   // short human label, e.g. "v2" or "after review"
	Summary     string `json:"summary,omitempty"` // change summary (may be multi-line)
}

// manifest is the on-disk versions.json shape.
type manifest struct {
	Head     string    `json:"head"`
	Versions []Version `json:"versions"`
}

// Anchor is the slashdocs-compatible wire shape for locating a comment's target
// text within a version: a quote with surrounding context plus offset hints.
type Anchor struct {
	Quote  string `json:"quote"`
	Prefix string `json:"prefix,omitempty"`
	Suffix string `json:"suffix,omitempty"`
	Start  int    `json:"start,omitempty"`
	End    int    `json:"end,omitempty"`
}

// Reaction is an emoji reaction with the set of authors who added it.
type Reaction struct {
	Emoji string   `json:"emoji"`
	Users []string `json:"users"`
}

// Comment is a doc-scoped comment. Replies point at a root via RootCommentID;
// a root comment carries the Anchor and an empty RootCommentID.
type Comment struct {
	ID                 string     `json:"id"`
	Anchor             *Anchor    `json:"anchor,omitempty"`
	Body               string     `json:"body"`
	Author             string     `json:"author,omitempty"`
	CreatedOnVersionID string     `json:"createdOnVersionId"`
	RootCommentID      string     `json:"rootCommentId,omitempty"`
	Status             string     `json:"status"` // "open" or "resolved"
	Reactions          []Reaction `json:"reactions,omitempty"`
	Edited             bool       `json:"edited,omitempty"`
	CreatedAt          string     `json:"createdAt"`
	UpdatedAt          string     `json:"updatedAt,omitempty"`
}

// Status values.
const (
	StatusOpen     = "open"
	StatusResolved = "resolved"
)

// Store is the root of the opendocs on-disk tree.
type Store struct {
	baseDir string
}

// New returns a Store rooted at ~/.opendocs/docs.
func New() *Store {
	return &Store{baseDir: filepath.Join(os.Getenv("HOME"), ".opendocs", "docs")}
}

// NewWithBase returns a Store rooted at an arbitrary directory (used in tests).
func NewWithBase(base string) *Store {
	return &Store{baseDir: base}
}

// Doc is a handle to one document's directory. It serializes its own writes.
type Doc struct {
	dir string
	mu  sync.Mutex
}

// Doc returns a handle for <project>/<doc>. It does not touch the disk until a
// method writes or reads.
func (s *Store) Doc(project, doc string) *Doc {
	return &Doc{dir: filepath.Join(s.baseDir, project, doc)}
}

// ListProjects returns the project slugs that have documents.
func (s *Store) ListProjects() ([]string, error) {
	return listDirs(s.baseDir)
}

// ListDocs returns the document slugs within a project.
func (s *Store) ListDocs(project string) ([]string, error) {
	return listDirs(filepath.Join(s.baseDir, project))
}

func listDirs(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, e.Name())
		}
	}
	return out, nil
}

// ── Versions ────────────────────────────────────────────────────────────────

func (d *Doc) versionsDir() string  { return filepath.Join(d.dir, "versions") }
func (d *Doc) manifestPath() string { return filepath.Join(d.dir, "versions.json") }
func (d *Doc) commentsPath() string { return filepath.Join(d.dir, "comments.json") }

// CreateVersion snapshots content as a new version whose parent is the current
// head. If expectedHead is non-empty it must equal the current head, or the
// write is refused with ErrConflict (optimistic concurrency). An empty
// expectedHead skips the check (first write, or a deliberate force).
func (d *Doc) CreateVersion(content []byte, expectedHead, label, summary string) (Version, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	m, err := d.loadManifest()
	if err != nil {
		return Version{}, err
	}
	if expectedHead != "" && expectedHead != m.Head {
		return Version{}, fmt.Errorf("%w: expected head %q, current head %q", ErrConflict, expectedHead, m.Head)
	}

	sum := sha256.Sum256(content)
	hash := hex.EncodeToString(sum[:])

	if err := os.MkdirAll(d.versionsDir(), 0o755); err != nil {
		return Version{}, err
	}
	htmlPath := filepath.Join(d.versionsDir(), hash+".html")
	// Content-addressed: only write if this exact content isn't already stored.
	if _, statErr := os.Stat(htmlPath); os.IsNotExist(statErr) {
		if err := writeFileAtomic(htmlPath, content); err != nil {
			return Version{}, err
		}
	}

	v := Version{
		ID:          newID(),
		Parent:      m.Head,
		ContentHash: hash,
		CreatedAt:   nowRFC3339(),
		Label:       label,
		Summary:     summary,
	}
	m.Versions = append(m.Versions, v)
	m.Head = v.ID
	if err := d.saveManifest(m); err != nil {
		return Version{}, err
	}
	return v, nil
}

// ListVersions returns the version entries in creation order.
func (d *Doc) ListVersions() ([]Version, error) {
	m, err := d.loadManifest()
	if err != nil {
		return nil, err
	}
	return m.Versions, nil
}

// Head returns the current head version, or ErrNotFound if the document has
// none yet.
func (d *Doc) Head() (Version, error) {
	m, err := d.loadManifest()
	if err != nil {
		return Version{}, err
	}
	if m.Head == "" {
		return Version{}, ErrNotFound
	}
	return d.versionByID(m, m.Head)
}

// GetVersion returns the version entry with the given id.
func (d *Doc) GetVersion(id string) (Version, error) {
	m, err := d.loadManifest()
	if err != nil {
		return Version{}, err
	}
	return d.versionByID(m, id)
}

func (d *Doc) versionByID(m *manifest, id string) (Version, error) {
	for _, v := range m.Versions {
		if v.ID == id {
			return v, nil
		}
	}
	return Version{}, fmt.Errorf("%w: version %q", ErrNotFound, id)
}

// ReadVersion returns the HTML bytes of a version by id.
func (d *Doc) ReadVersion(id string) ([]byte, error) {
	v, err := d.GetVersion(id)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(d.versionsDir(), v.ContentHash+".html"))
}

// Restore creates a new version whose content is copied from an earlier
// version. expectedHead guards the write like CreateVersion.
func (d *Doc) Restore(fromID, expectedHead string) (Version, error) {
	content, err := d.ReadVersion(fromID)
	if err != nil {
		return Version{}, err
	}
	return d.CreateVersion(content, expectedHead, "", "Restored from "+fromID)
}

func (d *Doc) loadManifest() (*manifest, error) {
	data, err := os.ReadFile(d.manifestPath())
	if os.IsNotExist(err) {
		return &manifest{}, nil
	}
	if err != nil {
		return nil, err
	}
	var m manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("opendocs: corrupt versions.json: %w", err)
	}
	return &m, nil
}

func (d *Doc) saveManifest(m *manifest) error {
	if err := os.MkdirAll(d.dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(d.manifestPath(), data)
}

// ── Comments ──────────────────────────────────────────────────────────────

// ListComments returns all comments for the document (roots and replies).
func (d *Doc) ListComments() ([]Comment, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.loadComments()
}

// AddComment appends a comment. A root comment (empty RootCommentID) should
// carry an Anchor; a reply references its root. Missing ids, timestamps, and
// status are filled in. Returns the stored comment.
func (d *Doc) AddComment(c Comment) (Comment, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	comments, err := d.loadComments()
	if err != nil {
		return Comment{}, err
	}
	if c.ID == "" {
		c.ID = newID()
	}
	if c.Status == "" {
		c.Status = StatusOpen
	}
	if c.CreatedAt == "" {
		c.CreatedAt = nowRFC3339()
	}
	if c.RootCommentID != "" {
		if !hasComment(comments, c.RootCommentID) {
			return Comment{}, fmt.Errorf("%w: root comment %q", ErrNotFound, c.RootCommentID)
		}
	}
	comments = append(comments, c)
	if err := d.saveComments(comments); err != nil {
		return Comment{}, err
	}
	return c, nil
}

// SetCommentStatus flips a comment's status (open/resolved) by id.
func (d *Doc) SetCommentStatus(id, status string) error {
	if status != StatusOpen && status != StatusResolved {
		return fmt.Errorf("opendocs: invalid status %q", status)
	}
	d.mu.Lock()
	defer d.mu.Unlock()

	comments, err := d.loadComments()
	if err != nil {
		return err
	}
	for i := range comments {
		if comments[i].ID == id {
			comments[i].Status = status
			comments[i].UpdatedAt = nowRFC3339()
			return d.saveComments(comments)
		}
	}
	return fmt.Errorf("%w: comment %q", ErrNotFound, id)
}

// EditComment replaces a comment's body and marks it edited.
func (d *Doc) EditComment(id, body string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	comments, err := d.loadComments()
	if err != nil {
		return err
	}
	for i := range comments {
		if comments[i].ID == id {
			comments[i].Body = body
			comments[i].Edited = true
			comments[i].UpdatedAt = nowRFC3339()
			return d.saveComments(comments)
		}
	}
	return fmt.Errorf("%w: comment %q", ErrNotFound, id)
}

// DeleteComment removes a comment and, if it is a thread root, its replies.
func (d *Doc) DeleteComment(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	comments, err := d.loadComments()
	if err != nil {
		return err
	}
	found := false
	kept := comments[:0]
	for _, c := range comments {
		if c.ID == id || c.RootCommentID == id {
			found = true
			continue
		}
		kept = append(kept, c)
	}
	if !found {
		return fmt.Errorf("%w: comment %q", ErrNotFound, id)
	}
	return d.saveComments(kept)
}

// ToggleReaction adds user's reaction with emoji, or removes it if already
// present. An emoji with no users left is dropped.
func (d *Doc) ToggleReaction(id, emoji, user string) error {
	if emoji == "" {
		return fmt.Errorf("opendocs: empty emoji")
	}
	d.mu.Lock()
	defer d.mu.Unlock()

	comments, err := d.loadComments()
	if err != nil {
		return err
	}
	for i := range comments {
		if comments[i].ID != id {
			continue
		}
		comments[i].Reactions = toggleReaction(comments[i].Reactions, emoji, user)
		comments[i].UpdatedAt = nowRFC3339()
		return d.saveComments(comments)
	}
	return fmt.Errorf("%w: comment %q", ErrNotFound, id)
}

func toggleReaction(reactions []Reaction, emoji, user string) []Reaction {
	for i := range reactions {
		if reactions[i].Emoji != emoji {
			continue
		}
		// Toggle user membership.
		users := reactions[i].Users[:0]
		removed := false
		for _, u := range reactions[i].Users {
			if u == user {
				removed = true
				continue
			}
			users = append(users, u)
		}
		if !removed {
			users = append(users, user)
		}
		reactions[i].Users = users
		if len(users) == 0 {
			return append(reactions[:i], reactions[i+1:]...)
		}
		return reactions
	}
	return append(reactions, Reaction{Emoji: emoji, Users: []string{user}})
}

func (d *Doc) loadComments() ([]Comment, error) {
	data, err := os.ReadFile(d.commentsPath())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var comments []Comment
	if err := json.Unmarshal(data, &comments); err != nil {
		return nil, fmt.Errorf("opendocs: corrupt comments.json: %w", err)
	}
	return comments, nil
}

func (d *Doc) saveComments(comments []Comment) error {
	if err := os.MkdirAll(d.dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(comments, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(d.commentsPath(), data)
}

func hasComment(comments []Comment, id string) bool {
	for _, c := range comments {
		if c.ID == id {
			return true
		}
	}
	return false
}

// ── Helpers ───────────────────────────────────────────────────────────────

// writeFileAtomic writes via a temp file in the same directory then renames, so
// a reader never observes a half-written file.
func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op after a successful rename
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func newID() string {
	var b [10]byte
	_, _ = rand.Read(b[:])
	return "v_" + hex.EncodeToString(b[:])
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

var nonSlugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slug normalizes an arbitrary string (a project path, a filename, or a
// document <title>) into a filesystem-safe slug.
func Slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "untitled"
	}
	return s
}
