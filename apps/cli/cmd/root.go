package cmd

import (
	"fmt"
	"os"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var browserFlag string
var cliVersion = "dev"

var rootCmd = &cobra.Command{
	Use:   "openplan",
	Short: "Interactive plan review for Claude Code",
	Long: `openplan intercepts Claude Code's ExitPlanMode hook, opens the plan
in a browser UI, and returns approve/deny decisions back to Claude Code.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runHookMode(browserFlag)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// SetVersion sets the CLI version string (injected from main.go at build time).
func SetVersion(v string) {
	rootCmd.Version = v
	cliVersion = v
}


func init() {
	rootCmd.PersistentFlags().StringVar(&browserFlag, "browser", "", "Override which browser to open")
	rootCmd.AddCommand(contextCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(annotateCmd)
	rootCmd.AddCommand(sessionsCmd)
	rootCmd.AddCommand(configCmd)
}

func runHookMode(browser string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	if browser != "" {
		cfg.Browser = browser
	}

	event, err := server.ReadHookEvent(os.Stdin)
	if err != nil {
		return fmt.Errorf("reading hook event: %w", err)
	}

	planContent := event.ToolInput.Plan
	projectSlug := storage.DeriveProjectSlug(event.CWD)
	planSlug := storage.DerivePlanSlug(planContent)

	store := storage.New()

	version, err := store.WriteVersion(projectSlug, planSlug, planContent)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not save version snapshot: %v\n", err)
	}

	if err := store.WriteMeta(projectSlug, planSlug, "pending", version); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not save meta: %v\n", err)
	}

	srv := server.New(cfg, event, projectSlug, planSlug, version, store, cliVersion)

	port, err := srv.Start()
	if err != nil {
		return fmt.Errorf("starting server: %w", err)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	if err := openBrowser(cfg.Browser, url); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not open browser: %v\n", err)
		fmt.Fprintf(os.Stderr, "openplan: open %s manually\n", url)
	}

	decision := srv.WaitForDecision()

	srv.Stop()

	fmt.Print(decision)

	return nil
}
