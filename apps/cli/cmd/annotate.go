package cmd

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var annotateCmd = &cobra.Command{
	Use:   "annotate [file|directory]",
	Short: "Open a file or directory in the annotation UI",
	Long:  "Open a markdown file or directory of markdown files in the Openplan annotation UI.",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runAnnotate,
}

var (
	annotateGate bool
	annotateHook bool
)

func init() {
	annotateCmd.Flags().BoolVar(&annotateGate, "gate", false, "Add Approve button; output approve/deny decision")
	annotateCmd.Flags().BoolVar(&annotateHook, "hook", false, "Output Claude Code hook-compatible JSON on close")
}

func runAnnotate(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	var content string
	var filename string
	var dirRoot string
	var dirFiles []string

	if len(args) == 0 {
		// No file specified — open blank annotator
		content = ""
		filename = "untitled"
	} else {
		filename = args[0]
		info, statErr := os.Stat(filename)
		if statErr != nil {
			return fmt.Errorf("accessing path: %w", statErr)
		}
		if info.IsDir() {
			abs, absErr := filepath.Abs(filename)
			if absErr != nil {
				return fmt.Errorf("resolving directory: %w", absErr)
			}
			files, listErr := listMarkdownFiles(abs)
			if listErr != nil {
				return fmt.Errorf("scanning directory: %w", listErr)
			}
			dirRoot = abs
			dirFiles = files
		} else {
			data, readErr := os.ReadFile(filename)
			if readErr != nil {
				return fmt.Errorf("reading file: %w", readErr)
			}
			content = string(data)
		}
	}

	planSlug := storage.DerivePlanSlug(content)
	if planSlug == "" {
		planSlug = "annotate"
	}
	projectSlug := "annotate"

	// Synthesize a hook event for the server
	evt := &server.HookEvent{
		HookEventName: "PermissionRequest",
		SessionID:     fmt.Sprintf("annotate-%d", time.Now().Unix()),
		ToolName:      "ExitPlanMode",
		CWD:           mustGetwd(),
	}
	evt.ToolInput.Plan = content

	store := storage.New()
	version, _ := store.WriteVersion(projectSlug, planSlug, content)
	_ = store.WriteMeta(projectSlug, planSlug, "pending", version)

	srv := server.New(cfg, evt, projectSlug, planSlug, version, store, cliVersion)
	srv.WithLabel(filename)
	if dirRoot != "" {
		srv.WithDirectory(dirRoot, dirFiles)
	}
	port, err := srv.Start()
	if err != nil {
		return fmt.Errorf("starting server: %w", err)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	sess := &storage.Session{
		PID:       os.Getpid(),
		Port:      port,
		URL:       url,
		Mode:      "annotate",
		Project:   projectSlug,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
		Label:     filename,
	}
	if wErr := storage.WriteSession(sess); wErr != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not write session file: %v\n", wErr)
	}

	if err := openBrowser(cfg.Browser, url); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not open browser: %v\n", err)
		fmt.Fprintf(os.Stderr, "openplan: open %s manually\n", url)
	}

	if annotateGate || annotateHook {
		decision := srv.WaitForDecision()
		srv.Stop()
		_ = storage.RemoveSession(os.Getpid())
		fmt.Print(decision)
	} else {
		// Non-gate mode: just open and return
		srv.WaitForDecision()
		srv.Stop()
		_ = storage.RemoveSession(os.Getpid())
	}

	return nil
}

func mustGetwd() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}

// listMarkdownFiles walks absDir and returns sorted relative paths of all .md files.
func listMarkdownFiles(absDir string) ([]string, error) {
	var paths []string
	err := filepath.WalkDir(absDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			name := d.Name()
			if name == "node_modules" || name == ".git" || name == "dist" ||
				name == "build" || name == ".next" || name == "__pycache__" ||
				name == ".obsidian" || name == ".trash" || name == ".turbo" ||
				name == ".cache" || name == "target" || name == "vendor" ||
				name == "coverage" || name == ".venv" || name == ".pytest_cache" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.ToLower(filepath.Ext(path)) == ".md" {
			rel, relErr := filepath.Rel(absDir, path)
			if relErr != nil {
				return relErr
			}
			paths = append(paths, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("no .md files found in %s", absDir)
	}
	sort.Strings(paths)
	return paths, nil
}
