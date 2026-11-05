package sqlstore

import (
	"os"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
	"github.com/smithg09/openplan/cli/internal/opendocs/store/storetest"
)

// Runs the shared contract suite against a real PostgreSQL. Skipped unless
// OPENDOCS_TEST_PG_DSN is set, e.g.
//
//	docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=pw postgres:16
//	OPENDOCS_TEST_PG_DSN='postgres://postgres:pw@localhost:55432/postgres?sslmode=disable' go test ./internal/opendocs/sqlstore
func TestPostgresBackendContract(t *testing.T) {
	dsn := os.Getenv("OPENDOCS_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("OPENDOCS_TEST_PG_DSN not set")
	}
	storetest.Run(t, func(t *testing.T) store.Backend {
		db, err := OpenPostgres(dsn)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.db.Exec(`TRUNCATE docs, blobs, versions, comments`); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		return db
	})
}
