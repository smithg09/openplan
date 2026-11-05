package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/smithg09/openplan/cli/internal/hookinstall"
	"github.com/spf13/cobra"
)

var installLocal bool

var installCmd = &cobra.Command{
	Use:   "install <claude|codex|agy>",
	Short: "Install the opendocs skills into an agent CLI",
	Long: `Writes the opendocs skill (publish, review, open, search) where the agent
discovers them, so it knows when to publish a document and how to act on
comments. Idempotent: re-running only rewrites skills whose content changed.

  claude   ~/.claude/skills            (.claude/skills with --local)
  codex    ~/.codex/skills             (.codex/skills with --local)
  agy      ~/.gemini/skills            (always global: agy does not discover project-local skills)

Copilot CLI is not supported yet: it has no verified skills directory.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		home, _ := cmd.Flags().GetString("home")
		if home == "" {
			home = userHome()
		}
		dir, written, err := installSkills(args[0], home, installLocal)
		if err != nil {
			return err
		}
		if len(written) == 0 {
			fmt.Printf("%s already has the latest opendocs skills\n", dir)
		} else {
			fmt.Printf("wrote opendocs skills to %s (%s)\n", dir, strings.Join(written, ", "))
		}
		fmt.Println("Restart the agent if it is already running so it picks the skills up.")
		return nil
	},
}

func init() {
	installCmd.Flags().BoolVar(&installLocal, "local", false, "install into the current project instead of the global location")
	installCmd.Flags().String("home", "", "override the home directory (for testing)")
	_ = installCmd.Flags().MarkHidden("home")
	rootCmd.AddCommand(installCmd)
}

// skillsDir returns where agent discovers skills.
func skillsDir(agent, home string, local bool) (string, error) {
	switch agent {
	case "claude", "claude-code":
		if local {
			return filepath.Join(".claude", "skills"), nil
		}
		return filepath.Join(home, ".claude", "skills"), nil
	case "codex":
		if local {
			return filepath.Join(".codex", "skills"), nil
		}
		return filepath.Join(home, ".codex", "skills"), nil
	case "agy", "antigravity":
		return filepath.Join(home, ".gemini", "skills"), nil
	case "copilot":
		return "", fmt.Errorf("copilot is not supported yet: no verified skills directory for Copilot CLI")
	}
	return "", fmt.Errorf("unknown agent %q — supported: claude, codex, agy", agent)
}

func installSkills(agent, home string, local bool) (dir string, written []string, err error) {
	dir, err = skillsDir(agent, home, local)
	if err != nil {
		return "", nil, err
	}
	written, err = hookinstall.WriteOpendocsSkills(dir)
	return dir, written, err
}
