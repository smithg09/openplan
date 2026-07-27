package cmd

import (
	"fmt"
	"os"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var codexPlanCmd = &cobra.Command{
	Use:    "codex-plan",
	Short:  "Stop hook for Codex CLI — reviews a plan if the turn produced one",
	Hidden: true,
	RunE:   runCodexPlan,
}

// runCodexPlan is spawned by Codex CLI's Stop hook at the end of every
// turn — Codex has no dedicated plan-exit event. Silent, no-error exits
// are deliberate here: most turns don't end with a plan, and this must
// not pop a browser (or print anything) on ordinary turns.
func runCodexPlan(cmd *cobra.Command, args []string) error {
	event, err := server.ReadCodexStopEvent(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not parse codex hook event: %v\n", err)
		return nil
	}

	rolloutPath := event.TranscriptPath
	if rolloutPath == "" {
		threadID := os.Getenv("CODEX_THREAD_ID")
		if threadID == "" {
			return nil
		}
		found, findErr := server.FindCodexRolloutByThreadID(threadID)
		if findErr != nil {
			return nil
		}
		rolloutPath = found
	}
	if _, statErr := os.Stat(rolloutPath); statErr != nil {
		return nil
	}

	planContent, found := server.GetLatestCodexPlan(rolloutPath, event.TurnID, event.StopHookActive)
	if !found || planContent == "" {
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
		HookEventName: "Stop",
		SessionID:     event.SessionID,
		ToolName:      "Stop",
		CWD:           event.CWD,
	}
	hookEvent.ToolInput.Plan = planContent

	srv := server.New(cfg, hookEvent, projectSlug, planSlug, version, store, cliVersion)
	srv.WithDecisionBuilder(server.CodexDecisionBuilder{})

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
