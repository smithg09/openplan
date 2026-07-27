package cmd

import (
	"fmt"
	"os"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var agyPlanCmd = &cobra.Command{
	Use:    "agy-plan",
	Short:  "PreToolUse hook for Antigravity CLI (agy) — intercepts plan-mode write_to_file calls",
	Hidden: true,
	RunE:   runAgyPlan,
}

// runAgyPlan is spawned by Antigravity CLI's PreToolUse hook on every
// tool call. No stdout output defers to agy's own approval flow (allow),
// which is the correct response for any tool call that isn't a plan
// submission.
func runAgyPlan(cmd *cobra.Command, args []string) error {
	event, err := server.ReadAntigravityEvent(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not parse antigravity hook event: %v\n", err)
		return nil
	}

	planContent, found := server.ExtractAntigravityPlan(event)
	if !found {
		return nil
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	if browserFlag != "" {
		cfg.Browser = browserFlag
	}

	cwd := ""
	if len(event.WorkspacePaths) > 0 {
		cwd = event.WorkspacePaths[0]
	}

	projectSlug := storage.DeriveProjectSlug(cwd)
	planSlug := storage.DerivePlanSlug(planContent)

	store := storage.New()

	version, err := store.WriteVersion(projectSlug, planSlug, planContent)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not save version snapshot: %v\n", err)
	}

	if err := store.WriteMeta(projectSlug, planSlug, "pending", version); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not save meta: %v\n", err)
	}

	hookEvent := &server.HookEvent{
		HookEventName: "PreToolUse",
		SessionID:     event.ConversationID,
		ToolName:      "write_to_file",
		CWD:           cwd,
	}
	hookEvent.ToolInput.Plan = planContent

	srv := server.New(cfg, hookEvent, projectSlug, planSlug, version, store, cliVersion)
	srv.WithDecisionBuilder(server.AntigravityDecisionBuilder{})

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
