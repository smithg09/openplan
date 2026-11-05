package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallSkillsPerAgent(t *testing.T) {
	for agent, rel := range map[string]string{
		"claude": ".claude/skills",
		"codex":  ".codex/skills",
		"agy":    ".gemini/skills",
	} {
		home := t.TempDir()
		dir, written, err := installSkills(agent, home, false)
		if err != nil {
			t.Fatalf("%s: %v", agent, err)
		}
		if dir != filepath.Join(home, rel) {
			t.Errorf("%s: dir = %s, want %s", agent, dir, filepath.Join(home, rel))
		}
		if len(written) != 4 {
			t.Errorf("%s: wrote %v, want 4 skills", agent, written)
		}
		for _, name := range []string{"opendocs-publish", "opendocs-review", "opendocs-open", "opendocs-archive"} {
			b, err := os.ReadFile(filepath.Join(dir, name, "SKILL.md"))
			if err != nil {
				t.Fatalf("%s: %v", agent, err)
			}
			if !strings.HasPrefix(string(b), "---\nname: "+name+"\n") {
				t.Errorf("%s/%s: frontmatter name must match the directory", agent, name)
			}
		}
		// Idempotent.
		if _, again, _ := installSkills(agent, home, false); len(again) != 0 {
			t.Errorf("%s: re-run rewrote %v", agent, again)
		}
	}
}

func TestInstallRefusesUnsupported(t *testing.T) {
	for _, a := range []string{"copilot", "vim"} {
		if _, _, err := installSkills(a, t.TempDir(), false); err == nil {
			t.Errorf("%s should be refused", a)
		}
	}
}

// Skills must only reference commands that exist, and agy has no local scope.
func TestSkillsReferenceRealCommands(t *testing.T) {
	home := t.TempDir()
	dir, _, _ := installSkills("claude", home, false)
	known := map[string]bool{}
	for _, c := range rootCmd.Commands() {
		known[c.Name()] = true
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		b, _ := os.ReadFile(filepath.Join(dir, e.Name(), "SKILL.md"))
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "$ "))
			if !strings.HasPrefix(line, "opendocs ") {
				continue
			}
			sub := strings.Fields(line)[1]
			if !known[sub] {
				t.Errorf("%s references unknown command %q: %s", e.Name(), sub, line)
			}
		}
	}
	if p, _, err := installSkills("agy", home, true); err != nil || !strings.HasSuffix(p, filepath.Join(".gemini", "skills")) {
		t.Errorf("agy --local must still be global, got %s %v", p, err)
	}
}

func TestSummarizeReview(t *testing.T) {
	// covered in depth by TestBuildReview; this guards the shared path.
	res := summarizeReview(nil, "d", "")
	if res.Open == nil || len(res.Open) != 0 {
		t.Errorf("empty review must have a non-nil open list, got %#v", res.Open)
	}
}

func TestGuidelinesMentionRealCommands(t *testing.T) {
	for _, c := range []string{"opendocs review", "opendocs publish", "opendocs feedback"} {
		if !strings.Contains(guidelinesMD, c) {
			t.Errorf("guidelines should mention %q", c)
		}
	}
}
