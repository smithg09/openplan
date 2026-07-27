package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/smithg09/openplan/cli/internal/hookinstall"
	"github.com/spf13/cobra"
)

var installLocal bool

var installCmd = &cobra.Command{
	Use:   "install <agent>",
	Short: "Configure hooks for an agent CLI automatically (codex, agy)",
	Long: `Writes and merges the hook configuration each agent CLI needs, instead
of hand-editing JSON/TOML. Safe to re-run: existing hooks, plugins, and
config are preserved — only openplan's own entry is added or updated.

Supported agents: codex, agy`,
	Args: cobra.ExactArgs(1),
	RunE: runInstall,
}

func init() {
	installCmd.Flags().BoolVar(&installLocal, "local", false, "Install into the current project instead of the global config")
	rootCmd.AddCommand(installCmd)
}

func runInstall(cmd *cobra.Command, args []string) error {
	openplanPath, err := os.Executable()
	if err != nil {
		openplanPath = "openplan"
	}

	switch args[0] {
	case "codex":
		return installCodex(openplanPath)
	case "agy", "antigravity":
		return installAgy(openplanPath)
	default:
		return fmt.Errorf("unknown agent %q — supported: codex, agy", args[0])
	}
}

func installCodex(openplanPath string) error {
	codexHome := filepath.Join(os.Getenv("HOME"), ".codex")
	if installLocal {
		codexHome = ".codex"
	}

	if _, err := os.Stat(codexHome); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: %s not found yet — creating it (this is normal if Codex hasn't run here before)\n", codexHome)
	}
	if err := os.MkdirAll(codexHome, 0755); err != nil {
		return fmt.Errorf("creating %s: %w", codexHome, err)
	}

	tomlPath := filepath.Join(codexHome, "config.toml")
	tomlData, err := os.ReadFile(tomlPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("reading %s: %w", tomlPath, err)
	}
	newToml, tomlChanged := hookinstall.EnsureCodexHooksFeature(string(tomlData))
	if tomlChanged {
		if err := os.WriteFile(tomlPath, []byte(newToml), 0644); err != nil {
			return fmt.Errorf("writing %s: %w", tomlPath, err)
		}
		fmt.Printf("  updated %s (enabled [features] hooks = true)\n", tomlPath)
	} else {
		fmt.Printf("  %s already has hooks enabled\n", tomlPath)
	}

	hooksPath := filepath.Join(codexHome, "hooks.json")
	hooksData, err := os.ReadFile(hooksPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("reading %s: %w", hooksPath, err)
	}
	command := openplanPath + " codex-plan"
	newHooks, hooksChanged, err := hookinstall.EnsureCodexStopHook(hooksData, command)
	if err != nil {
		return fmt.Errorf("updating %s: %w", hooksPath, err)
	}
	if hooksChanged {
		if err := os.WriteFile(hooksPath, newHooks, 0644); err != nil {
			return fmt.Errorf("writing %s: %w", hooksPath, err)
		}
		fmt.Printf("  updated %s (added Stop hook)\n", hooksPath)
	} else {
		fmt.Printf("  %s already has the openplan Stop hook\n", hooksPath)
	}

	skillsPath := filepath.Join(codexHome, "skills")
	written, err := hookinstall.WriteSkills(skillsPath)
	if err != nil {
		return fmt.Errorf("installing skills into %s: %w", skillsPath, err)
	}
	if len(written) > 0 {
		fmt.Printf("  wrote skills to %s (%v)\n", skillsPath, written)
	} else {
		fmt.Printf("  %s already has the latest openplan skills\n", skillsPath)
	}

	fmt.Println()
	fmt.Println("Codex hooks and skills configured. Restart Codex to activate.")
	return nil
}

func installAgy(openplanPath string) error {
	var hooksPath string
	if installLocal {
		hooksPath = filepath.Join(".agents", "hooks.json")
	} else {
		hooksPath = filepath.Join(os.Getenv("HOME"), ".gemini", "config", "hooks.json")
	}

	dir := filepath.Dir(hooksPath)
	if _, err := os.Stat(dir); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: %s not found yet — creating it (this is normal if agy hasn't run here before)\n", dir)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("creating %s: %w", dir, err)
	}

	hooksData, err := os.ReadFile(hooksPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("reading %s: %w", hooksPath, err)
	}
	command := openplanPath + " agy-plan"
	newHooks, changed, err := hookinstall.EnsureAgyPlanHook(hooksData, command)
	if err != nil {
		return fmt.Errorf("updating %s: %w", hooksPath, err)
	}
	if changed {
		if err := os.WriteFile(hooksPath, newHooks, 0644); err != nil {
			return fmt.Errorf("writing %s: %w", hooksPath, err)
		}
		fmt.Printf("  updated %s\n", hooksPath)
	} else {
		fmt.Printf("  %s already has the openplan hook\n", hooksPath)
	}

	// agy only discovers skills from its global ~/.gemini/skills directory
	// (confirmed empirically — a project-local .agents/skills or .gemini/skills
	// is not picked up without --add-dir). Skills install there regardless of
	// --local, which only affects the hooks.json path above.
	skillsPath := filepath.Join(os.Getenv("HOME"), ".gemini", "skills")
	written, err := hookinstall.WriteSkills(skillsPath)
	if err != nil {
		return fmt.Errorf("installing skills into %s: %w", skillsPath, err)
	}
	if len(written) > 0 {
		fmt.Printf("  wrote skills to %s (%v)\n", skillsPath, written)
	} else {
		fmt.Printf("  %s already has the latest openplan skills\n", skillsPath)
	}

	fmt.Println()
	fmt.Println("Antigravity CLI hooks and skills configured. Restart agy to activate.")
	return nil
}
