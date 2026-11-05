package sqlstore

import (
	"fmt"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
)

// Grants returns an auth.Grants stored in the same database, so a hosted
// instance with an ephemeral disk keeps its capability links across deploys.
// Only token hashes are stored.
func (d *DB) Grants() auth.Grants { return sqlGrants{d.db} }

type sqlGrants struct{ db *rdb }

var _ auth.Grants = sqlGrants{}

func (g sqlGrants) Mint(doc string, role auth.Role, label string) (string, auth.Grant, error) {
	if doc == "" {
		return "", auth.Grant{}, fmt.Errorf("auth: empty doc id")
	}
	if role == auth.RoleNone {
		return "", auth.Grant{}, fmt.Errorf("auth: cannot mint a token for role none")
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		return "", auth.Grant{}, err
	}
	gr := auth.Grant{Doc: doc, TokenHash: hash, Role: role, Label: label, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	_, err = g.db.DB.Exec(g.db.d.rebind(`INSERT INTO grants (doc, token_hash, role, label, created_at) VALUES (?, ?, ?, ?, ?)`),
		gr.Doc, gr.TokenHash, role.String(), gr.Label, gr.CreatedAt)
	if err != nil {
		return "", auth.Grant{}, err
	}
	return token, gr, nil
}

func scanGrant(sc interface{ Scan(...any) error }) (auth.Grant, error) {
	var gr auth.Grant
	var role string
	if err := sc.Scan(&gr.Doc, &gr.TokenHash, &role, &gr.Label, &gr.CreatedAt); err != nil {
		return auth.Grant{}, err
	}
	r, err := auth.ParseRole(role)
	if err != nil {
		return auth.Grant{}, err
	}
	gr.Role = r
	return gr, nil
}

const grantCols = `doc, token_hash, role, label, created_at`

func (g sqlGrants) Lookup(doc, token string) (auth.Grant, bool) {
	if token == "" {
		return auth.Grant{}, false
	}
	gr, err := scanGrant(g.db.QueryRow(`SELECT `+grantCols+` FROM grants WHERE doc = ? AND token_hash = ?`, doc, auth.HashToken(token)))
	if err != nil {
		return auth.Grant{}, false // unknown token or DB error: fail closed
	}
	return gr, true
}

func (g sqlGrants) List(doc string) ([]auth.Grant, error) {
	rows, err := g.db.Query(`SELECT `+grantCols+` FROM grants WHERE doc = ? ORDER BY created_at, token_hash`, doc)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []auth.Grant
	for rows.Next() {
		gr, err := scanGrant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, gr)
	}
	return out, rows.Err()
}

func (g sqlGrants) Revoke(doc, tokenHash string) error {
	res, err := g.db.DB.Exec(g.db.d.rebind(`DELETE FROM grants WHERE doc = ? AND token_hash = ?`), doc, tokenHash)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrGrantNotFound
	}
	return nil
}
