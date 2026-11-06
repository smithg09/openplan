// Package auth is opendocs' capability-based access control for the
// multi-tenant proxy: roles, permissions, bearer tokens, and signed frame URLs.
//
// Model: a document is addressed by an opaque id; whoever holds a token minted
// for it acts with that token's role. There are no accounts. Only the sha256 of
// a token is stored, so a leaked database does not leak working credentials.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// Role is a capability level. Higher roles include everything below them.
type Role int

const (
	RoleNone      Role = iota // no valid token
	RoleViewer                // read the doc and its comments
	RoleCommenter             // + comment, reply, react, resolve; edit/delete own comments
	RoleEditor                // + publish versions, restore, delete any comment, share
)

func (r Role) String() string {
	switch r {
	case RoleViewer:
		return "viewer"
	case RoleCommenter:
		return "commenter"
	case RoleEditor:
		return "editor"
	default:
		return "none"
	}
}

// ParseRole converts "viewer"/"commenter"/"editor" to a Role. RoleNone is not
// parseable: nobody mints a token for it.
func ParseRole(s string) (Role, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "viewer":
		return RoleViewer, nil
	case "commenter":
		return RoleCommenter, nil
	case "editor":
		return RoleEditor, nil
	}
	return RoleNone, fmt.Errorf("auth: unknown role %q (want viewer, commenter, or editor)", s)
}

// Action is something a caller wants to do to a document.
type Action int

const (
	ActRead      Action = iota // read versions, frames, comments
	ActComment                 // add a comment or reply, react, resolve/reopen
	ActModifyOwn               // edit or delete a comment the caller authored
	ActWrite                   // publish/restore versions, delete any comment, mint shares
)

// minRole is the lowest role allowed to perform each action.
var minRole = map[Action]Role{
	ActRead:      RoleViewer,
	ActComment:   RoleCommenter,
	ActModifyOwn: RoleCommenter,
	ActWrite:     RoleEditor,
}

// Can reports whether the role may perform the action.
func (r Role) Can(a Action) bool {
	min, ok := minRole[a]
	return ok && r != RoleNone && r >= min
}

// NewToken returns a fresh 256-bit bearer token (base64url, no padding) and the
// hash to store for it.
func NewToken() (token, hash string, err error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", "", fmt.Errorf("auth: generating token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(b[:])
	return token, HashToken(token), nil
}

// HashToken returns the storable identifier for a token (hex sha256). Tokens are
// high-entropy random values, so a fast hash is appropriate (no salt needed).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// BearerToken extracts the token from an "Authorization: Bearer <token>" value.
func BearerToken(header string) string {
	const prefix = "Bearer "
	if len(header) > len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
		return strings.TrimSpace(header[len(prefix):])
	}
	return ""
}
