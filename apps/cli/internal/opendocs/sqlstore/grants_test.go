package sqlstore

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
)

func grantsContract(t *testing.T, g auth.Grants, rawCheck func(token string) bool) {
	tok, minted, err := g.Mint("docA", auth.RoleCommenter, "alice")
	if err != nil {
		t.Fatal(err)
	}
	got, ok := g.Lookup("docA", tok)
	if !ok || got.Role != auth.RoleCommenter || got.TokenHash != minted.TokenHash || got.Label != "alice" {
		t.Fatalf("Lookup = %+v ok=%v", got, ok)
	}
	if _, ok := g.Lookup("docB", tok); ok {
		t.Error("token must not authorize another doc")
	}
	for _, bad := range []string{"", "nope", tok + "x"} {
		if _, ok := g.Lookup("docA", bad); ok {
			t.Errorf("bogus token %q accepted", bad)
		}
	}
	if _, _, err := g.Mint("", auth.RoleViewer, ""); err == nil {
		t.Error("empty doc must be rejected")
	}
	if _, _, err := g.Mint("docA", auth.RoleNone, ""); err == nil {
		t.Error("role none must not be mintable")
	}
	g.Mint("docA", auth.RoleViewer, "")
	g.Mint("docB", auth.RoleEditor, "")
	if l, _ := g.List("docA"); len(l) != 2 {
		t.Errorf("List(docA) = %d, want 2", len(l))
	}
	if err := g.Revoke("docB", minted.TokenHash); !errors.Is(err, auth.ErrGrantNotFound) {
		t.Errorf("cross-doc revoke must fail, got %v", err)
	}
	if err := g.Revoke("docA", minted.TokenHash); err != nil {
		t.Fatal(err)
	}
	if _, ok := g.Lookup("docA", tok); ok {
		t.Error("revoked token still works")
	}
	if err := g.Revoke("docA", minted.TokenHash); !errors.Is(err, auth.ErrGrantNotFound) {
		t.Errorf("double revoke = %v", err)
	}
	if rawCheck != nil && rawCheck(tok) {
		t.Error("raw token found in the database")
	}
}

func TestSQLiteGrants(t *testing.T) {
	path := filepath.Join(t.TempDir(), "g.db")
	db, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	grantsContract(t, db.Grants(), func(tok string) bool {
		db.db.DB.Exec(`PRAGMA wal_checkpoint(FULL)`)
		for _, f := range []string{path, path + "-wal"} {
			if b, _ := os.ReadFile(f); strings.Contains(string(b), tok) {
				return true
			}
		}
		return false
	})
}

func TestPostgresGrants(t *testing.T) {
	dsn := os.Getenv("OPENDOCS_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("OPENDOCS_TEST_PG_DSN not set")
	}
	db, err := OpenPostgres(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.db.DB.Exec(`TRUNCATE grants`)
	grantsContract(t, db.Grants(), nil)
}

func TestSQLiteOwners(t *testing.T) {
	db, err := OpenSQLite(filepath.Join(t.TempDir(), "o.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	o := db.Owners()
	for _, p := range [][2]string{{"u1", "d1"}, {"u1", "d1"}, {"u1", "d2"}, {"u2", "d3"}} {
		if err := o.Add(p[0], p[1]); err != nil {
			t.Fatal(err)
		}
	}
	docs, err := o.Docs("u1")
	if err != nil || len(docs) != 2 {
		t.Fatalf("u1 docs = %v, %v", docs, err)
	}
	if !o.Owns("u2", "d3") || o.Owns("u2", "d1") || o.Owns("nobody", "d1") {
		t.Error("ownership leaked across users")
	}
}
