package store

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func newTestDoc(t *testing.T) *Doc {
	t.Helper()
	s := NewWithBase(t.TempDir())
	return s.Doc("proj", "doc")
}

func TestCreateAndReadVersion(t *testing.T) {
	d := newTestDoc(t)

	v1, err := d.CreateVersion([]byte("<h1>hello</h1>"), "", "v1", "first")
	if err != nil {
		t.Fatalf("CreateVersion: %v", err)
	}
	if v1.ID == "" || v1.ContentHash == "" {
		t.Fatalf("version missing id/hash: %+v", v1)
	}
	if v1.Parent != "" {
		t.Errorf("first version should have no parent, got %q", v1.Parent)
	}

	got, err := d.ReadVersion(v1.ID)
	if err != nil {
		t.Fatalf("ReadVersion: %v", err)
	}
	if string(got) != "<h1>hello</h1>" {
		t.Errorf("content mismatch: %q", got)
	}

	head, err := d.Head()
	if err != nil {
		t.Fatalf("Head: %v", err)
	}
	if head.ID != v1.ID {
		t.Errorf("head = %q, want %q", head.ID, v1.ID)
	}
}

func TestParentChain(t *testing.T) {
	d := newTestDoc(t)

	v1, _ := d.CreateVersion([]byte("one"), "", "", "")
	v2, err := d.CreateVersion([]byte("two"), v1.ID, "", "")
	if err != nil {
		t.Fatalf("CreateVersion v2: %v", err)
	}
	if v2.Parent != v1.ID {
		t.Errorf("v2.Parent = %q, want %q", v2.Parent, v1.ID)
	}

	versions, _ := d.ListVersions()
	if len(versions) != 2 {
		t.Fatalf("want 2 versions, got %d", len(versions))
	}
}

func TestOptimisticConcurrency(t *testing.T) {
	d := newTestDoc(t)

	v1, _ := d.CreateVersion([]byte("one"), "", "", "")
	// Writing with the correct expected head succeeds.
	if _, err := d.CreateVersion([]byte("two"), v1.ID, "", ""); err != nil {
		t.Fatalf("expected success with correct head: %v", err)
	}
	// Writing again with the now-stale head (v1) must conflict.
	_, err := d.CreateVersion([]byte("three"), v1.ID, "", "")
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("want ErrConflict, got %v", err)
	}
}

func TestContentAddressingDedupes(t *testing.T) {
	d := newTestDoc(t)

	v1, _ := d.CreateVersion([]byte("same bytes"), "", "", "")
	v2, _ := d.CreateVersion([]byte("same bytes"), v1.ID, "", "")

	// Distinct version entries...
	if v1.ID == v2.ID {
		t.Errorf("version ids should differ even for identical content")
	}
	// ...but a single shared content file.
	if v1.ContentHash != v2.ContentHash {
		t.Errorf("identical content should share a hash")
	}
	entries, _ := os.ReadDir(d.versionsDir())
	htmlCount := 0
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".html" {
			htmlCount++
		}
	}
	if htmlCount != 1 {
		t.Errorf("want 1 stored html file, got %d", htmlCount)
	}
}

func TestReadVersionNotFound(t *testing.T) {
	d := newTestDoc(t)
	if _, err := d.ReadVersion("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestHeadEmpty(t *testing.T) {
	d := newTestDoc(t)
	if _, err := d.Head(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound for empty doc, got %v", err)
	}
}

func TestRestore(t *testing.T) {
	d := newTestDoc(t)

	v1, _ := d.CreateVersion([]byte("original"), "", "", "")
	v2, _ := d.CreateVersion([]byte("edited"), v1.ID, "", "")

	v3, err := d.Restore(v1.ID, v2.ID)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	content, _ := d.ReadVersion(v3.ID)
	if string(content) != "original" {
		t.Errorf("restored content = %q, want %q", content, "original")
	}
	if v3.Parent != v2.ID {
		t.Errorf("restore parent = %q, want %q", v3.Parent, v2.ID)
	}
}

func TestComments(t *testing.T) {
	d := newTestDoc(t)
	v1, _ := d.CreateVersion([]byte("<p>the quick brown fox</p>"), "", "", "")

	root, err := d.AddComment(Comment{
		Body:               "is this right?",
		Author:             "smith",
		CreatedOnVersionID: v1.ID,
		Anchor:             &Anchor{Quote: "quick brown", Prefix: "the ", Suffix: " fox"},
	})
	if err != nil {
		t.Fatalf("AddComment root: %v", err)
	}
	if root.ID == "" {
		t.Fatal("root comment missing id")
	}
	if root.Status != StatusOpen {
		t.Errorf("default status = %q, want open", root.Status)
	}

	// A reply referencing the root.
	if _, err := d.AddComment(Comment{
		Body:               "yes",
		CreatedOnVersionID: v1.ID,
		RootCommentID:      root.ID,
	}); err != nil {
		t.Fatalf("AddComment reply: %v", err)
	}

	// A reply to a non-existent root is rejected.
	if _, err := d.AddComment(Comment{Body: "orphan", RootCommentID: "ghost"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound for bad root, got %v", err)
	}

	comments, _ := d.ListComments()
	if len(comments) != 2 {
		t.Fatalf("want 2 comments, got %d", len(comments))
	}

	if err := d.SetCommentStatus(root.ID, StatusResolved); err != nil {
		t.Fatalf("SetCommentStatus: %v", err)
	}
	comments, _ = d.ListComments()
	for _, c := range comments {
		if c.ID == root.ID && c.Status != StatusResolved {
			t.Errorf("status not persisted: %q", c.Status)
		}
	}

	if err := d.SetCommentStatus("ghost", StatusResolved); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestEditDeleteReact(t *testing.T) {
	d := newTestDoc(t)
	v, _ := d.CreateVersion([]byte("<p>text</p>"), "", "", "")
	root, _ := d.AddComment(Comment{Body: "orig", CreatedOnVersionID: v.ID, Anchor: &Anchor{Quote: "text"}})
	reply, _ := d.AddComment(Comment{Body: "re", CreatedOnVersionID: v.ID, RootCommentID: root.ID})

	// Edit.
	if err := d.EditComment(root.ID, "updated"); err != nil {
		t.Fatalf("EditComment: %v", err)
	}
	comments, _ := d.ListComments()
	for _, c := range comments {
		if c.ID == root.ID {
			if c.Body != "updated" || !c.Edited {
				t.Errorf("edit not applied: body=%q edited=%v", c.Body, c.Edited)
			}
		}
	}

	// React toggle: add, then remove.
	if err := d.ToggleReaction(root.ID, "👍", "smith"); err != nil {
		t.Fatalf("ToggleReaction add: %v", err)
	}
	comments, _ = d.ListComments()
	if got := reactionUsers(comments, root.ID, "👍"); len(got) != 1 {
		t.Errorf("want 1 reactor, got %v", got)
	}
	if err := d.ToggleReaction(root.ID, "👍", "smith"); err != nil {
		t.Fatalf("ToggleReaction remove: %v", err)
	}
	comments, _ = d.ListComments()
	if got := reactionUsers(comments, root.ID, "👍"); got != nil {
		t.Errorf("reaction should be gone, got %v", got)
	}

	// Delete root also removes its reply.
	if err := d.DeleteComment(root.ID); err != nil {
		t.Fatalf("DeleteComment: %v", err)
	}
	comments, _ = d.ListComments()
	if len(comments) != 0 {
		t.Errorf("want 0 comments after deleting root+reply, got %d", len(comments))
	}
	_ = reply

	if err := d.DeleteComment("ghost"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func reactionUsers(comments []Comment, id, emoji string) []string {
	for _, c := range comments {
		if c.ID != id {
			continue
		}
		for _, r := range c.Reactions {
			if r.Emoji == emoji {
				return r.Users
			}
		}
	}
	return nil
}

// Handles are created per request, so the lock must be shared across handles
// for the same doc. Run with -race.
func TestConcurrentCommentsAcrossHandles(t *testing.T) {
	s := NewWithBase(t.TempDir())
	v, _ := s.Doc("p", "d").CreateVersion([]byte("<p>x</p>"), "", "", "")

	const n = 25
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// A fresh handle each time, exactly like a request handler.
			if _, err := s.Doc("p", "d").AddComment(Comment{Body: "c", CreatedOnVersionID: v.ID}); err != nil {
				t.Errorf("AddComment: %v", err)
			}
		}()
	}
	wg.Wait()

	comments, _ := s.Doc("p", "d").ListComments()
	if len(comments) != n {
		t.Fatalf("lost updates: want %d comments, got %d", n, len(comments))
	}
}

func TestSameHeadCreateVersionConflictsOnce(t *testing.T) {
	s := NewWithBase(t.TempDir())
	v1, _ := s.Doc("p", "d").CreateVersion([]byte("one"), "", "", "")

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.Doc("p", "d").CreateVersion([]byte("next-"+string(rune('a'+i))), v1.ID, "", "")
		}()
	}
	wg.Wait()

	conflicts := 0
	for _, err := range errs {
		if errors.Is(err, ErrConflict) {
			conflicts++
		}
	}
	if conflicts != 1 {
		t.Fatalf("want exactly 1 ErrConflict from two same-head writes, got %d (%v)", conflicts, errs)
	}
}

func TestSlug(t *testing.T) {
	cases := map[string]string{
		"My Report.html": "my-report-html",
		"  spaced  ":     "spaced",
		"":               "untitled",
		"Already-Good":   "already-good",
	}
	for in, want := range cases {
		if got := Slug(in); got != want {
			t.Errorf("Slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestListProjectsAndDocs(t *testing.T) {
	s := NewWithBase(t.TempDir())
	if _, err := s.Doc("alpha", "one").CreateVersion([]byte("x"), "", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Doc("alpha", "two").CreateVersion([]byte("y"), "", "", ""); err != nil {
		t.Fatal(err)
	}
	projects, _ := s.ListProjects()
	if len(projects) != 1 || projects[0] != "alpha" {
		t.Errorf("projects = %v, want [alpha]", projects)
	}
	docs, _ := s.ListDocs("alpha")
	if len(docs) != 2 {
		t.Errorf("want 2 docs, got %v", docs)
	}
}
