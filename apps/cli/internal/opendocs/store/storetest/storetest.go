// Package storetest is the contract suite every opendocs store.Backend must
// pass. Backends call Run from their own tests with a constructor that returns a
// fresh, empty backend per call:
//
//	storetest.Run(t, func(t *testing.T) store.Backend { ... })
//
// Keeping one suite is what lets the filesystem store, SQLite, and Postgres be
// swapped behind the server without behavioural drift.
package storetest

import (
	"errors"
	"sync"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// Factory returns a new, empty backend. It is called once per subtest.
type Factory func(t *testing.T) store.Backend

// Run executes the full contract suite against backends built by newBackend.
func Run(t *testing.T, newBackend Factory) {
	t.Helper()
	cases := map[string]func(*testing.T, store.Backend){
		"VersionsAndParentChain":     versionsAndParentChain,
		"ReadVersionRoundTrip":       readVersionRoundTrip,
		"HeadOnEmptyDocIsNotFound":   headOnEmpty,
		"UnknownVersionIsNotFound":   unknownVersion,
		"OptimisticConcurrency":      optimisticConcurrency,
		"IdenticalContentKeepsChain": identicalContent,
		"Restore":                    restore,
		"CommentsThreadsAndStatus":   commentsThreadsAndStatus,
		"EditDeleteReact":            editDeleteReact,
		"DocsAreIsolated":            docsAreIsolated,
		"ListDocs":                   listDocs,
		"ConcurrentCommentsNoLoss":   concurrentComments,
		"SameHeadWritesConflictOnce": sameHeadConflictOnce,
		"CommentsSurviveNewHandle":   commentsSurviveNewHandle,
	}
	for name, fn := range cases {
		t.Run(name, func(t *testing.T) { fn(t, newBackend(t)) })
	}
}

func doc(b store.Backend) store.DocStore { return b.Doc("proj", "doc") }

func mustVersion(t *testing.T, d store.DocStore, content, head string) store.Version {
	t.Helper()
	v, err := d.CreateVersion([]byte(content), head, "", "")
	if err != nil {
		t.Fatalf("CreateVersion(%q): %v", content, err)
	}
	return v
}

func versionsAndParentChain(t *testing.T, b store.Backend) {
	d := doc(b)
	v1 := mustVersion(t, d, "one", "")
	if v1.ID == "" || v1.ContentHash == "" || v1.CreatedAt == "" {
		t.Fatalf("version missing fields: %+v", v1)
	}
	if v1.Parent != "" {
		t.Errorf("first version parent = %q, want empty", v1.Parent)
	}
	v2 := mustVersion(t, d, "two", v1.ID)
	if v2.Parent != v1.ID {
		t.Errorf("v2.Parent = %q, want %q", v2.Parent, v1.ID)
	}

	vs, err := d.ListVersions()
	if err != nil || len(vs) != 2 || vs[0].ID != v1.ID || vs[1].ID != v2.ID {
		t.Fatalf("ListVersions order/len wrong: %+v err=%v", vs, err)
	}
	head, err := d.Head()
	if err != nil || head.ID != v2.ID {
		t.Fatalf("Head = %+v err=%v, want %s", head, err, v2.ID)
	}
	got, err := d.GetVersion(v1.ID)
	if err != nil || got.ID != v1.ID {
		t.Fatalf("GetVersion: %+v err=%v", got, err)
	}
}

func readVersionRoundTrip(t *testing.T, b store.Backend) {
	d := doc(b)
	want := "<h1>héllo ✓</h1>\n<p>bytes must round-trip exactly</p>"
	v := mustVersion(t, d, want, "")
	got, err := d.ReadVersion(v.ID)
	if err != nil || string(got) != want {
		t.Fatalf("ReadVersion = %q err=%v, want %q", got, err, want)
	}
}

func headOnEmpty(t *testing.T, b store.Backend) {
	if _, err := doc(b).Head(); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("Head on empty doc: want ErrNotFound, got %v", err)
	}
	if vs, err := doc(b).ListVersions(); err != nil || len(vs) != 0 {
		t.Fatalf("ListVersions on empty doc: %v err=%v", vs, err)
	}
}

func unknownVersion(t *testing.T, b store.Backend) {
	d := doc(b)
	mustVersion(t, d, "x", "")
	if _, err := d.ReadVersion("nope"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("ReadVersion(unknown): want ErrNotFound, got %v", err)
	}
	if _, err := d.GetVersion("nope"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetVersion(unknown): want ErrNotFound, got %v", err)
	}
}

func optimisticConcurrency(t *testing.T, b store.Backend) {
	d := doc(b)
	v1 := mustVersion(t, d, "one", "")
	mustVersion(t, d, "two", v1.ID) // head moves on
	if _, err := d.CreateVersion([]byte("three"), v1.ID, "", ""); !errors.Is(err, store.ErrConflict) {
		t.Fatalf("stale head: want ErrConflict, got %v", err)
	}
	// A rejected write must not have changed anything.
	if vs, _ := d.ListVersions(); len(vs) != 2 {
		t.Errorf("rejected write persisted a version: %d versions", len(vs))
	}
}

func identicalContent(t *testing.T, b store.Backend) {
	d := doc(b)
	v1 := mustVersion(t, d, "same", "")
	v2 := mustVersion(t, d, "same", v1.ID)
	if v1.ID == v2.ID {
		t.Error("identical content must still produce a distinct version entry")
	}
	if v1.ContentHash != v2.ContentHash {
		t.Error("identical content must share a content hash")
	}
	if v2.Parent != v1.ID {
		t.Errorf("parent chain broken for repeated content: %q", v2.Parent)
	}
}

func restore(t *testing.T, b store.Backend) {
	d := doc(b)
	v1 := mustVersion(t, d, "original", "")
	v2 := mustVersion(t, d, "edited", v1.ID)
	v3, err := d.Restore(v1.ID, v2.ID)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if got, _ := d.ReadVersion(v3.ID); string(got) != "original" {
		t.Errorf("restored content = %q", got)
	}
	if v3.Parent != v2.ID {
		t.Errorf("restore parent = %q, want %q", v3.Parent, v2.ID)
	}
	if _, err := d.Restore(v1.ID, v1.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Restore with stale head: want ErrConflict, got %v", err)
	}
	if _, err := d.Restore("ghost", v3.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Restore unknown: want ErrNotFound, got %v", err)
	}
}

func commentsThreadsAndStatus(t *testing.T, b store.Backend) {
	d := doc(b)
	v := mustVersion(t, d, "<p>the quick brown fox</p>", "")

	root, err := d.AddComment(store.Comment{
		Body: "is this right?", Author: "smith", CreatedOnVersionID: v.ID,
		Anchor: &store.Anchor{Quote: "quick brown", Prefix: "the ", Suffix: " fox", Start: 7, End: 18},
	})
	if err != nil {
		t.Fatalf("AddComment root: %v", err)
	}
	if root.ID == "" || root.Status != store.StatusOpen || root.CreatedAt == "" {
		t.Fatalf("root defaults not applied: %+v", root)
	}
	if _, err := d.AddComment(store.Comment{Body: "yes", CreatedOnVersionID: v.ID, RootCommentID: root.ID}); err != nil {
		t.Fatalf("AddComment reply: %v", err)
	}
	if _, err := d.AddComment(store.Comment{Body: "orphan", RootCommentID: "ghost"}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("reply to unknown root: want ErrNotFound, got %v", err)
	}

	cs, _ := d.ListComments()
	if len(cs) != 2 {
		t.Fatalf("want 2 comments, got %d", len(cs))
	}
	// Anchor must round-trip intact — it is what re-anchoring depends on.
	for _, c := range cs {
		if c.ID == root.ID {
			a := c.Anchor
			if a == nil || a.Quote != "quick brown" || a.Prefix != "the " || a.Suffix != " fox" || a.Start != 7 || a.End != 18 {
				t.Errorf("anchor not preserved: %+v", a)
			}
		}
	}

	if err := d.SetCommentStatus(root.ID, store.StatusResolved); err != nil {
		t.Fatalf("SetCommentStatus: %v", err)
	}
	cs, _ = d.ListComments()
	for _, c := range cs {
		if c.ID == root.ID && c.Status != store.StatusResolved {
			t.Errorf("status not persisted: %q", c.Status)
		}
	}
	if err := d.SetCommentStatus(root.ID, "bogus"); err == nil {
		t.Error("invalid status must be rejected")
	}
	if err := d.SetCommentStatus("ghost", store.StatusOpen); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("status on unknown comment: want ErrNotFound, got %v", err)
	}
}

func editDeleteReact(t *testing.T, b store.Backend) {
	d := doc(b)
	v := mustVersion(t, d, "<p>text</p>", "")
	root, _ := d.AddComment(store.Comment{Body: "orig", CreatedOnVersionID: v.ID, Anchor: &store.Anchor{Quote: "text"}})
	if _, err := d.AddComment(store.Comment{Body: "re", CreatedOnVersionID: v.ID, RootCommentID: root.ID}); err != nil {
		t.Fatal(err)
	}

	if err := d.EditComment(root.ID, "updated"); err != nil {
		t.Fatalf("EditComment: %v", err)
	}
	find := func() store.Comment {
		cs, _ := d.ListComments()
		for _, c := range cs {
			if c.ID == root.ID {
				return c
			}
		}
		t.Fatal("root comment missing")
		return store.Comment{}
	}
	if c := find(); c.Body != "updated" || !c.Edited {
		t.Errorf("edit not applied: %+v", c)
	}
	if err := d.EditComment("ghost", "x"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("edit unknown: want ErrNotFound, got %v", err)
	}

	// Reactions toggle per user; an emoji with no users disappears.
	users := func(emoji string) []string {
		for _, r := range find().Reactions {
			if r.Emoji == emoji {
				return r.Users
			}
		}
		return nil
	}
	if err := d.ToggleReaction(root.ID, "👍", "a"); err != nil {
		t.Fatal(err)
	}
	if err := d.ToggleReaction(root.ID, "👍", "b"); err != nil {
		t.Fatal(err)
	}
	if got := users("👍"); len(got) != 2 {
		t.Errorf("want 2 reactors, got %v", got)
	}
	if err := d.ToggleReaction(root.ID, "👍", "a"); err != nil {
		t.Fatal(err)
	}
	if got := users("👍"); len(got) != 1 || got[0] != "b" {
		t.Errorf("toggle off for a: got %v", got)
	}
	if err := d.ToggleReaction(root.ID, "👍", "b"); err != nil {
		t.Fatal(err)
	}
	if got := users("👍"); got != nil {
		t.Errorf("empty reaction must be dropped, got %v", got)
	}
	if err := d.ToggleReaction(root.ID, "", "a"); err == nil {
		t.Error("empty emoji must be rejected")
	}
	if err := d.ToggleReaction("ghost", "👍", "a"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("react unknown: want ErrNotFound, got %v", err)
	}

	// Deleting a root removes its replies too.
	if err := d.DeleteComment(root.ID); err != nil {
		t.Fatalf("DeleteComment: %v", err)
	}
	if cs, _ := d.ListComments(); len(cs) != 0 {
		t.Errorf("want 0 comments after deleting root+reply, got %d", len(cs))
	}
	if err := d.DeleteComment("ghost"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("delete unknown: want ErrNotFound, got %v", err)
	}
}

// Two documents (and two projects) must never see each other's data — the
// proxy is multi-tenant.
func docsAreIsolated(t *testing.T, b store.Backend) {
	a, c := b.Doc("p1", "d"), b.Doc("p2", "d")
	other := b.Doc("p1", "e")
	va := mustVersion(t, a, "alpha", "")
	mustVersion(t, c, "gamma", "")
	if _, err := a.AddComment(store.Comment{Body: "on a", CreatedOnVersionID: va.ID}); err != nil {
		t.Fatal(err)
	}
	if cs, _ := c.ListComments(); len(cs) != 0 {
		t.Errorf("comment leaked across projects: %v", cs)
	}
	if cs, _ := other.ListComments(); len(cs) != 0 {
		t.Errorf("comment leaked across docs: %v", cs)
	}
	if _, err := c.ReadVersion(va.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("version id from another project must be NotFound, got %v", err)
	}
}

func listDocs(t *testing.T, b store.Backend) {
	if docs, err := b.ListDocs("proj"); err != nil || len(docs) != 0 {
		t.Fatalf("ListDocs on empty project: %v err=%v", docs, err)
	}
	mustVersion(t, b.Doc("proj", "one"), "x", "")
	mustVersion(t, b.Doc("proj", "two"), "y", "")
	mustVersion(t, b.Doc("other", "three"), "z", "")
	docs, err := b.ListDocs("proj")
	if err != nil || len(docs) != 2 {
		t.Fatalf("ListDocs = %v err=%v, want 2 docs", docs, err)
	}
}

// Handles are cheap and created per request; the backend — not the handle —
// must serialize writers. Run the suite with -race.
func concurrentComments(t *testing.T, b store.Backend) {
	v := mustVersion(t, doc(b), "<p>x</p>", "")
	const n = 25
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := doc(b).AddComment(store.Comment{Body: "c", CreatedOnVersionID: v.ID}); err != nil {
				t.Errorf("AddComment: %v", err)
			}
		}()
	}
	wg.Wait()
	if cs, _ := doc(b).ListComments(); len(cs) != n {
		t.Fatalf("lost updates: want %d comments, got %d", n, len(cs))
	}
}

func sameHeadConflictOnce(t *testing.T, b store.Backend) {
	v1 := mustVersion(t, doc(b), "one", "")
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = doc(b).CreateVersion([]byte{'a' + byte(i)}, v1.ID, "", "")
		}()
	}
	wg.Wait()
	conflicts := 0
	for _, err := range errs {
		if errors.Is(err, store.ErrConflict) {
			conflicts++
		} else if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
	}
	if conflicts != 1 {
		t.Fatalf("want exactly 1 ErrConflict from two same-head writes, got %d (%v)", conflicts, errs)
	}
	if vs, _ := doc(b).ListVersions(); len(vs) != 2 {
		t.Errorf("want 2 versions (v1 + the winner), got %d", len(vs))
	}
}

func commentsSurviveNewHandle(t *testing.T, b store.Backend) {
	v := mustVersion(t, b.Doc("proj", "doc"), "<p>x</p>", "")
	if _, err := b.Doc("proj", "doc").AddComment(store.Comment{Body: "kept", CreatedOnVersionID: v.ID}); err != nil {
		t.Fatal(err)
	}
	cs, _ := b.Doc("proj", "doc").ListComments()
	if len(cs) != 1 || cs[0].Body != "kept" {
		t.Fatalf("state must live in the backend, not the handle: %+v", cs)
	}
}
