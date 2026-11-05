package sqlstore

import (
	"path/filepath"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
	"github.com/smithg09/openplan/cli/internal/opendocs/store/storetest"
)

func TestSQLiteBackendContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) store.Backend {
		db, err := Open(filepath.Join(t.TempDir(), "od.db"))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		return db
	})
}

// Data must survive closing and reopening the file.
func TestSQLitePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "od.db")
	db, _ := Open(path)
	v, err := db.Doc("p", "d").CreateVersion([]byte("<p>x</p>"), "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	db.Doc("p", "d").AddComment(store.Comment{Body: "kept", CreatedOnVersionID: v.ID})
	db.Close()

	db2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()
	if cs, _ := db2.Doc("p", "d").ListComments(); len(cs) != 1 || cs[0].Body != "kept" {
		t.Fatalf("comments lost across reopen: %+v", cs)
	}
	if b, err := db2.Doc("p", "d").ReadVersion(v.ID); err != nil || string(b) != "<p>x</p>" {
		t.Fatalf("version lost across reopen: %q %v", b, err)
	}
}
