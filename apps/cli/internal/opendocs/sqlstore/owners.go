package sqlstore

import (
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
)

// Owners returns an auth.Owners stored in the same database.
func (d *DB) Owners() auth.Owners { return sqlOwners{d.db} }

type sqlOwners struct{ db *rdb }

var _ auth.Owners = sqlOwners{}

func (o sqlOwners) Add(user, doc string) error {
	if o.Owns(user, doc) {
		return nil
	}
	_, err := o.db.DB.Exec(o.db.d.rebind(`INSERT INTO doc_owners (user_id, doc, created_at) VALUES (?, ?, ?)`), user, doc, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (o sqlOwners) Owns(user, doc string) bool {
	var n int
	if err := o.db.QueryRow(`SELECT COUNT(*) FROM doc_owners WHERE user_id = ? AND doc = ?`, user, doc).Scan(&n); err != nil {
		return false // fail closed
	}
	return n > 0
}

func (o sqlOwners) Docs(user string) ([]auth.OwnedDoc, error) {
	rows, err := o.db.Query(`SELECT doc, created_at FROM doc_owners WHERE user_id = ? ORDER BY created_at DESC, doc`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []auth.OwnedDoc{}
	for rows.Next() {
		var d auth.OwnedDoc
		if err := rows.Scan(&d.Doc, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
