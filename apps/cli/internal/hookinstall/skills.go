package hookinstall

import (
	"bytes"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// skillsFS embeds the SKILL.md files openplan ships for agent CLIs that
// discover skills from a plain directory (Codex, Antigravity/agy) rather
// than through a plugin/marketplace install flow. Content is agent-agnostic
// — each skill just tells the model to run an openplan subcommand and act on
// its output — so one embedded copy is written out for every target agent.
//
//go:embed skills/openplan
var skillsFS embed.FS

const skillsRoot = "skills/openplan"

// SkillNames lists the embedded skill directory names, in a stable order.
func SkillNames() ([]string, error) {
	entries, err := fs.ReadDir(skillsFS, skillsRoot)
	if err != nil {
		return nil, fmt.Errorf("reading embedded skills: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// WriteSkills writes each embedded skill's SKILL.md to
// destDir/<skill-name>/SKILL.md, creating directories as needed. It's
// idempotent: a skill whose on-disk content already matches is left
// untouched (and its name omitted from written). Returns the skill names
// that were newly created or updated.
func WriteSkills(destDir string) (written []string, err error) {
	names, err := SkillNames()
	if err != nil {
		return nil, err
	}

	for _, name := range names {
		srcPath := filepath.Join(skillsRoot, name, "SKILL.md")
		content, err := fs.ReadFile(skillsFS, filepath.ToSlash(srcPath))
		if err != nil {
			return written, fmt.Errorf("reading embedded skill %q: %w", name, err)
		}

		skillDir := filepath.Join(destDir, name)
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			return written, fmt.Errorf("creating %s: %w", skillDir, err)
		}

		dstPath := filepath.Join(skillDir, "SKILL.md")
		existing, readErr := os.ReadFile(dstPath)
		if readErr == nil && bytes.Equal(existing, content) {
			continue
		}

		if err := os.WriteFile(dstPath, content, 0644); err != nil {
			return written, fmt.Errorf("writing %s: %w", dstPath, err)
		}
		written = append(written, name)
	}

	return written, nil
}
