package store

// DocStore is the per-document persistence contract the server depends on. The
// filesystem store implements it; so can a SQL store. Every implementation must
// pass the shared contract suite in the storetest package, and must return the
// package's ErrConflict / ErrNotFound sentinels (wrapped is fine — callers use
// errors.Is).
type DocStore interface {
	// CreateVersion snapshots content as a new version whose parent is the
	// current head. A non-empty expectedHead must equal the current head or the
	// write fails with ErrConflict; it must be atomic with respect to other
	// writers, so two same-head writes yield exactly one ErrConflict.
	CreateVersion(content []byte, expectedHead, label, summary string) (Version, error)
	ListVersions() ([]Version, error)
	Head() (Version, error) // ErrNotFound when the doc has no versions
	GetVersion(id string) (Version, error)
	ReadVersion(id string) ([]byte, error)
	Restore(fromID, expectedHead string) (Version, error)

	ListComments() ([]Comment, error)
	AddComment(c Comment) (Comment, error)
	SetCommentStatus(id, status string) error
	EditComment(id, body string) error
	DeleteComment(id string) error // also removes a thread root's replies
	ToggleReaction(id, emoji, user string) error
}

// Backend resolves documents. project scopes a namespace (a working directory
// for the local server; a tenant for the proxy).
type Backend interface {
	Doc(project, doc string) DocStore
	ListDocs(project string) ([]string, error)
}

var _ DocStore = (*Doc)(nil)

// fsBackend adapts the filesystem Store to Backend. Store.Doc returns the
// concrete *Doc (which tests and the CLI use directly), so the adapter exists
// only to satisfy the interface's return type.
type fsBackend struct{ s *Store }

// Backend returns the filesystem store as a Backend.
func (s *Store) Backend() Backend { return fsBackend{s} }

func (b fsBackend) Doc(project, doc string) DocStore { return b.s.Doc(project, doc) }

func (b fsBackend) ListDocs(project string) ([]string, error) { return b.s.ListDocs(project) }
