package hookinstall

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteSkills_WritesAllSkillsToFreshDir(t *testing.T) {
	dir := t.TempDir()
	written, err := WriteSkills(dir)
	if err != nil {
		t.Fatalf("WriteSkills: %v", err)
	}

	names, err := SkillNames()
	if err != nil {
		t.Fatalf("SkillNames: %v", err)
	}
	if len(written) != len(names) {
		t.Fatalf("expected all %d skills written, got %d: %v", len(names), len(written), written)
	}

	for _, name := range names {
		path := filepath.Join(dir, name, "SKILL.md")
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("expected %s to exist: %v", path, err)
		}
		if len(data) == 0 {
			t.Errorf("%s is empty", path)
		}
	}
}

func TestWriteSkills_Idempotent(t *testing.T) {
	dir := t.TempDir()
	if _, err := WriteSkills(dir); err != nil {
		t.Fatalf("first install: %v", err)
	}
	written, err := WriteSkills(dir)
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if len(written) != 0 {
		t.Errorf("expected no skills rewritten on re-install, got %v", written)
	}
}

func TestWriteSkills_UpdatesChangedContent(t *testing.T) {
	dir := t.TempDir()
	if _, err := WriteSkills(dir); err != nil {
		t.Fatalf("first install: %v", err)
	}

	names, err := SkillNames()
	if err != nil {
		t.Fatalf("SkillNames: %v", err)
	}
	target := filepath.Join(dir, names[0], "SKILL.md")
	if err := os.WriteFile(target, []byte("stale content"), 0644); err != nil {
		t.Fatalf("mutating %s: %v", target, err)
	}

	written, err := WriteSkills(dir)
	if err != nil {
		t.Fatalf("re-install after mutation: %v", err)
	}
	if len(written) != 1 || written[0] != names[0] {
		t.Errorf("expected exactly %q rewritten, got %v", names[0], written)
	}

	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("reading %s: %v", target, err)
	}
	if string(data) == "stale content" {
		t.Error("stale content was not overwritten")
	}
}

func TestWriteSkills_PreservesUnrelatedFilesInDestDir(t *testing.T) {
	dir := t.TempDir()
	other := filepath.Join(dir, "some-other-skill")
	if err := os.MkdirAll(other, 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(other, "SKILL.md"), []byte("unrelated"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if _, err := WriteSkills(dir); err != nil {
		t.Fatalf("WriteSkills: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(other, "SKILL.md"))
	if err != nil {
		t.Fatalf("unrelated skill was removed: %v", err)
	}
	if string(data) != "unrelated" {
		t.Errorf("unrelated skill content was modified: %s", data)
	}
}
