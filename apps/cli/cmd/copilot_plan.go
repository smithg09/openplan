package cmd

import (
	"fmt"
	"os"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var copilotPlanCmd = &cobra.Command{
	Use:    "copilot-plan",
	Short:  "preToolUse hook for GitHub Copilot CLI — intercepts exit_plan_mode",
	Hidden: true,
	RunE:   runCopilotPlan,
}

// runCopilotPlan is spawned by Copilot CLI's preToolUse hook on every tool
// call. No stdout output means "allow" — that's the correct response for
// any tool call that isn't a plan submission, or where nothing usable was
// found, so failures here fall through to a silent allow rather than an
// error exit.
func runCopilotPlan(cmd *cobra.Command, args []string) error {
	event, err := server.ReadCopilotEvent(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not parse copilot hook event: %v\n", err)
		return nil
	}

	if event.ToolName != "exit_plan_mode" {
		return nil
	}

	planContent, err := server.FindCopilotPlanContent(event.SessionID)
	if err != nil || planContent == "" {
		return nil
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	if browserFlag != "" {
		cfg.Browser = browserFlag
	}

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

	hookEvent := &server.HookEvent{
		HookEventName: "preToolUse",
		SessionID:     event.SessionID,
		ToolName:      "exit_plan_mode",
		CWD:           event.CWD,
	}
	hookEvent.ToolInput.Plan = planContent

	srv := server.New(cfg, hookEvent, projectSlug, planSlug, version, store, cliVersion)
	srv.WithDecisionBuilder(server.CopilotDecisionBuilder{})

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
