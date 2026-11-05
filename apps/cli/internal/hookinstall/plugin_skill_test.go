package hookinstall

import (
	"os"
	"path/filepath"
	"testing"
)

// The Claude Code plugin ships the opendocs skill as a plain file
// (apps/plugin/skills/opendocs/SKILL.md) while `opendocs install` writes the
// embedded copy. They must be the same bytes, or users get different behaviour
// depending on how they installed. To update: copy the embedded file over the plugin's.
func TestPluginSkillMatchesEmbedded(t *testing.T) {
	embedded, err := skillsFS.ReadFile(opendocsSkillsRoot + "/opendocs/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	plugin, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin", "skills", "opendocs", "SKILL.md"))
	if err != nil {
		t.Fatalf("plugin skill missing: %v", err)
	}
	if string(plugin) != string(embedded) {
		t.Fatal("apps/plugin/skills/opendocs/SKILL.md differs from internal/hookinstall/skills/opendocs/opendocs/SKILL.md — copy the embedded one over it")
	}
}
