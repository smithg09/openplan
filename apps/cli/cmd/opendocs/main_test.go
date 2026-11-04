package main

import (
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

func TestBuildReview(t *testing.T) {
	doc := store.NewWithBase(t.TempDir()).Doc("p", "d")
	v, err := doc.CreateVersion([]byte("<p>alpha beta gamma</p>"), "", "", "")
	if err != nil {
		t.Fatal(err)
	}

	open, _ := doc.AddComment(store.Comment{Body: "fix this", Author: "rev", CreatedOnVersionID: v.ID, Anchor: &store.Anchor{Quote: "beta"}})
	if _, err := doc.AddComment(store.Comment{Body: "why?", Author: "me", CreatedOnVersionID: v.ID, RootCommentID: open.ID}); err != nil {
		t.Fatal(err)
	}
	done, _ := doc.AddComment(store.Comment{Body: "ok", CreatedOnVersionID: v.ID, Anchor: &store.Anchor{Quote: "gamma"}})
	if err := doc.SetCommentStatus(done.ID, store.StatusResolved); err != nil {
		t.Fatal(err)
	}

	res, err := buildReview(doc, "d")
	if err != nil {
		t.Fatal(err)
	}
	if res.VersionID != v.ID {
		t.Errorf("versionId = %q, want %q", res.VersionID, v.ID)
	}
	if len(res.Open) != 1 || res.Open[0].Quote != "beta" || len(res.Open[0].Replies) != 1 {
		t.Errorf("open threads wrong: %+v", res.Open)
	}
	if res.Resolved != 1 {
		t.Errorf("resolvedCount = %d, want 1", res.Resolved)
	}
}

func TestBuildReviewEmptyIsNotNull(t *testing.T) {
	doc := store.NewWithBase(t.TempDir()).Doc("p", "d")
	res, err := buildReview(doc, "d")
	if err != nil {
		t.Fatal(err)
	}
	if res.Open == nil {
		t.Error("Open should be an empty slice so it encodes as [] not null")
	}
}
