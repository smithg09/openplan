// Package sqlstore is a SQL-backed store.Backend (SQLite or PostgreSQL) for
// opendocs-proxy. It lives in its own package, imported only by
// cmd/opendocs-proxy, so the database drivers are never linked into the
// openplan or opendocs binaries.
//
// Every mutation runs in a transaction. SQLite serialises through a single
// connection; PostgreSQL locks the document row (SELECT ... FOR UPDATE), so
// optimistic-concurrency (If-Match) checks are atomic in both.
package sqlstore

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"

	"strconv"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

const schemaTmpl = `
CREATE TABLE IF NOT EXISTS docs (
  project TEXT NOT NULL,
  doc     TEXT NOT NULL,
  head    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project, doc)
);
CREATE TABLE IF NOT EXISTS blobs (
  project TEXT NOT NULL,
  doc     TEXT NOT NULL,
  hash    TEXT NOT NULL,
  content {{BLOB}} NOT NULL,
  PRIMARY KEY (project, doc, hash)
);
CREATE TABLE IF NOT EXISTS versions (
  n            {{SERIAL}},
  project      TEXT NOT NULL,
  doc          TEXT NOT NULL,
  id           TEXT NOT NULL,
  parent       TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  UNIQUE (project, doc, id)
);
CREATE TABLE IF NOT EXISTS grants (
  doc        TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  role       TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (doc, token_hash)
);
CREATE TABLE IF NOT EXISTS doc_owners (
  user_id    TEXT NOT NULL,
  doc        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, doc)
);
CREATE TABLE IF NOT EXISTS comments (
  n       {{SERIAL}},
  project TEXT NOT NULL,
  doc     TEXT NOT NULL,
  id      TEXT NOT NULL,
  root    TEXT NOT NULL DEFAULT '',
  data    TEXT NOT NULL,
  UNIQUE (project, doc, id)
);
`

// dialect captures the small SQL differences between the supported databases.
type dialect struct {
	name      string
	blob      string
	serial    string
	numbered  bool   // placeholders are $1,$2 rather than ?
	forUpdate string // appended to the head lookup to lock the document row
}

var (
	sqliteDialect = dialect{name: "sqlite", blob: "BLOB", serial: "INTEGER PRIMARY KEY AUTOINCREMENT"}
	pgDialect     = dialect{name: "postgres", blob: "BYTEA", serial: "BIGSERIAL PRIMARY KEY", numbered: true, forUpdate: " FOR UPDATE"}
)

func (d dialect) schema() string {
	return strings.NewReplacer("{{BLOB}}", d.blob, "{{SERIAL}}", d.serial).Replace(schemaTmpl)
}

// rebind rewrites ? placeholders to $n for numbered dialects.
func (d dialect) rebind(q string) string {
	if !d.numbered {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// rdb and rtx rebind placeholders so every query is written once with `?`.
type rdb struct {
	*sql.DB
	d dialect
}

func (r *rdb) Query(q string, a ...any) (*sql.Rows, error) { return r.DB.Query(r.d.rebind(q), a...) }
func (r *rdb) QueryRow(q string, a ...any) *sql.Row        { return r.DB.QueryRow(r.d.rebind(q), a...) }

type rtx struct {
	*sql.Tx
	d dialect
}

func (r *rtx) Exec(q string, a ...any) (sql.Result, error) { return r.Tx.Exec(r.d.rebind(q), a...) }
func (r *rtx) QueryRow(q string, a ...any) *sql.Row        { return r.Tx.QueryRow(r.d.rebind(q), a...) }

// DB is a SQL-backed store.Backend.
type DB struct{ db *rdb }

var _ store.Backend = (*DB)(nil)

// Open opens (creating if needed) the SQLite database at path.
func Open(path string) (*DB, error) { return OpenSQLite(path) }

// OpenSQLite opens (creating if needed) the SQLite database at path.
func OpenSQLite(path string) (*DB, error) {
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	db, err := sql.Open("sqlite", "file:"+path+"?"+q.Encode())
	if err != nil {
		return nil, err
	}
	// A single connection serialises all access: a transaction holds it, so
	// check-then-write sequences cannot interleave.
	db.SetMaxOpenConns(1)
	return initDB(db, sqliteDialect)
}

// OpenPostgres connects to a PostgreSQL database (a postgres:// DSN).
func OpenPostgres(dsn string) (*DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	return initDB(db, pgDialect)
}

func initDB(db *sql.DB, d dialect) (*DB, error) {
	if _, err := db.Exec(d.schema()); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlstore: init %s schema: %w", d.name, err)
	}
	return &DB{db: &rdb{DB: db, d: d}}, nil
}

// Close releases the database.
func (d *DB) Close() error { return d.db.Close() }

func (d *DB) Doc(project, doc string) store.DocStore {
	return &docStore{db: d.db, project: project, doc: doc}
}

func (d *DB) ListDocs(project string) ([]string, error) {
	rows, err := d.db.Query(`SELECT doc FROM docs WHERE project = ? ORDER BY doc`, project)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type docStore struct {
	db           *rdb
	project, doc string
}

func newID() string {
	var b [10]byte
	_, _ = rand.Read(b[:])
	return "v_" + hex.EncodeToString(b[:])
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

// tx runs fn in a transaction, committing on nil and rolling back otherwise.
func (s *docStore) tx(fn func(*rtx) error) error {
	stx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if err := fn(&rtx{Tx: stx, d: s.db.d}); err != nil {
		_ = stx.Rollback()
		return err
	}
	return stx.Commit()
}

func (s *docStore) ensureDoc(tx *rtx) error {
	_, err := tx.Exec(`INSERT INTO docs (project, doc) VALUES (?, ?) ON CONFLICT DO NOTHING`, s.project, s.doc)
	return err
}

// ── versions ────────────────────────────────────────────────────────────────

func (s *docStore) CreateVersion(content []byte, expectedHead, label, summary string) (store.Version, error) {
	var v store.Version
	err := s.tx(func(tx *rtx) error {
		if err := s.ensureDoc(tx); err != nil {
			return err
		}
		var head string
		if err := tx.QueryRow(`SELECT head FROM docs WHERE project = ? AND doc = ?`+s.db.d.forUpdate, s.project, s.doc).Scan(&head); err != nil {
			return err
		}
		if expectedHead != "" && expectedHead != head {
			return fmt.Errorf("%w: expected head %q, current head %q", store.ErrConflict, expectedHead, head)
		}
		sum := sha256.Sum256(content)
		hash := hex.EncodeToString(sum[:])
		if _, err := tx.Exec(`INSERT INTO blobs (project, doc, hash, content) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
			s.project, s.doc, hash, content); err != nil {
			return err
		}
		v = store.Version{ID: newID(), Parent: head, ContentHash: hash, CreatedAt: now(), Label: label, Summary: summary}
		if _, err := tx.Exec(`INSERT INTO versions (project, doc, id, parent, content_hash, created_at, label, summary)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, s.project, s.doc, v.ID, v.Parent, v.ContentHash, v.CreatedAt, v.Label, v.Summary); err != nil {
			return err
		}
		_, err := tx.Exec(`UPDATE docs SET head = ? WHERE project = ? AND doc = ?`, v.ID, s.project, s.doc)
		return err
	})
	if err != nil {
		return store.Version{}, err
	}
	return v, nil
}

const versionCols = `id, parent, content_hash, created_at, label, summary`

func scanVersion(sc interface{ Scan(...any) error }) (store.Version, error) {
	var v store.Version
	err := sc.Scan(&v.ID, &v.Parent, &v.ContentHash, &v.CreatedAt, &v.Label, &v.Summary)
	return v, err
}

func (s *docStore) ListVersions() ([]store.Version, error) {
	rows, err := s.db.Query(`SELECT `+versionCols+` FROM versions WHERE project = ? AND doc = ? ORDER BY n`, s.project, s.doc)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.Version
	for rows.Next() {
		v, err := scanVersion(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *docStore) Head() (store.Version, error) {
	var head string
	err := s.db.QueryRow(`SELECT head FROM docs WHERE project = ? AND doc = ?`, s.project, s.doc).Scan(&head)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && head == "") {
		return store.Version{}, store.ErrNotFound
	}
	if err != nil {
		return store.Version{}, err
	}
	return s.GetVersion(head)
}

func (s *docStore) GetVersion(id string) (store.Version, error) {
	v, err := scanVersion(s.db.QueryRow(`SELECT `+versionCols+` FROM versions WHERE project = ? AND doc = ? AND id = ?`,
		s.project, s.doc, id))
	if errors.Is(err, sql.ErrNoRows) {
		return store.Version{}, fmt.Errorf("%w: version %q", store.ErrNotFound, id)
	}
	return v, err
}

func (s *docStore) ReadVersion(id string) ([]byte, error) {
	var content []byte
	err := s.db.QueryRow(`SELECT b.content FROM versions v JOIN blobs b
		ON b.project = v.project AND b.doc = v.doc AND b.hash = v.content_hash
		WHERE v.project = ? AND v.doc = ? AND v.id = ?`, s.project, s.doc, id).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("%w: version %q", store.ErrNotFound, id)
	}
	return content, err
}

func (s *docStore) Restore(fromID, expectedHead string) (store.Version, error) {
	content, err := s.ReadVersion(fromID)
	if err != nil {
		return store.Version{}, err
	}
	return s.CreateVersion(content, expectedHead, "", "Restored from "+fromID)
}

// ── comments ────────────────────────────────────────────────────────────────

func (s *docStore) ListComments() ([]store.Comment, error) {
	rows, err := s.db.Query(`SELECT data FROM comments WHERE project = ? AND doc = ? ORDER BY n`, s.project, s.doc)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.Comment
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		var c store.Comment
		if err := json.Unmarshal([]byte(data), &c); err != nil {
			return nil, fmt.Errorf("sqlstore: corrupt comment row: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *docStore) AddComment(c store.Comment) (store.Comment, error) {
	if c.ID == "" {
		c.ID = newID()
	}
	if c.Status == "" {
		c.Status = store.StatusOpen
	}
	if c.CreatedAt == "" {
		c.CreatedAt = now()
	}
	err := s.tx(func(tx *rtx) error {
		if c.RootCommentID != "" {
			var one int
			err := tx.QueryRow(`SELECT 1 FROM comments WHERE project = ? AND doc = ? AND id = ?`,
				s.project, s.doc, c.RootCommentID).Scan(&one)
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("%w: root comment %q", store.ErrNotFound, c.RootCommentID)
			}
			if err != nil {
				return err
			}
		}
		if err := s.ensureDoc(tx); err != nil {
			return err
		}
		data, err := json.Marshal(c)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO comments (project, doc, id, root, data) VALUES (?, ?, ?, ?, ?)`,
			s.project, s.doc, c.ID, c.RootCommentID, string(data))
		return err
	})
	if err != nil {
		return store.Comment{}, err
	}
	return c, nil
}

// update loads comment id, applies mutate, and writes it back atomically.
func (s *docStore) update(id string, mutate func(*store.Comment)) error {
	return s.tx(func(tx *rtx) error {
		var data string
		err := tx.QueryRow(`SELECT data FROM comments WHERE project = ? AND doc = ? AND id = ?`, s.project, s.doc, id).Scan(&data)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: comment %q", store.ErrNotFound, id)
		}
		if err != nil {
			return err
		}
		var c store.Comment
		if err := json.Unmarshal([]byte(data), &c); err != nil {
			return err
		}
		mutate(&c)
		c.UpdatedAt = now()
		out, err := json.Marshal(c)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`UPDATE comments SET data = ? WHERE project = ? AND doc = ? AND id = ?`, string(out), s.project, s.doc, id)
		return err
	})
}

func (s *docStore) SetCommentStatus(id, status string) error {
	if status != store.StatusOpen && status != store.StatusResolved {
		return fmt.Errorf("opendocs: invalid status %q", status)
	}
	return s.update(id, func(c *store.Comment) { c.Status = status })
}

func (s *docStore) EditComment(id, body string) error {
	return s.update(id, func(c *store.Comment) { c.Body = body; c.Edited = true })
}

func (s *docStore) DeleteComment(id string) error {
	return s.tx(func(tx *rtx) error {
		res, err := tx.Exec(`DELETE FROM comments WHERE project = ? AND doc = ? AND (id = ? OR root = ?)`, s.project, s.doc, id, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("%w: comment %q", store.ErrNotFound, id)
		}
		return nil
	})
}

func (s *docStore) ToggleReaction(id, emoji, user string) error {
	if emoji == "" {
		return fmt.Errorf("opendocs: empty emoji")
	}
	return s.update(id, func(c *store.Comment) { c.Reactions = toggle(c.Reactions, emoji, user) })
}

func toggle(rs []store.Reaction, emoji, user string) []store.Reaction {
	for i := range rs {
		if rs[i].Emoji != emoji {
			continue
		}
		users := rs[i].Users[:0]
		removed := false
		for _, u := range rs[i].Users {
			if u == user {
				removed = true
				continue
			}
			users = append(users, u)
		}
		if !removed {
			users = append(users, user)
		}
		rs[i].Users = users
		if len(users) == 0 {
			return append(rs[:i], rs[i+1:]...)
		}
		return rs
	}
	return append(rs, store.Reaction{Emoji: emoji, Users: []string{user}})
}
