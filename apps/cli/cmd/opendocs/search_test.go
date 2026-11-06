package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// `-word` exclusions must reach the query parser, not be eaten as a flag.
func TestSearchExclusionIsNotAFlag(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	dir := t.TempDir()
	cwd, _ := os.Getwd()
	defer os.Chdir(cwd)
	os.Chdir(dir)
	os.WriteFile(filepath.Join(dir, "a.html"), []byte("<p>beta launch</p>"), 0o644)
	os.WriteFile(filepath.Join(dir, "b.html"), []byte("<p>beta outage</p>"), 0o644)
	for _, f := range []string{"a.html", "b.html"} {
		if _, err := runCLI(t, "create", f); err != nil {
			t.Fatal(err)
		}
	}
	out, err := runCLI(t, "search", "beta", "-outage")
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if !strings.Contains(out, "a-html") || strings.Contains(out, "b-html") {
		t.Errorf("exclusion not applied:\n%s", out)
	}
	if _, err := runCLI(t, "search", "-only"); err == nil {
		t.Error("exclusion-only query must be rejected")
	}
}
