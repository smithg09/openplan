package server

import (
	"encoding/json"
	"fmt"
	"io"
)

// CodexStopEvent is the JSON Codex CLI sends on stdin to a Stop hook
// command, fired at the end of every turn (there's no dedicated
// plan-exit event in Codex, unlike Claude Code's ExitPlanMode).
type CodexStopEvent struct {
	HookEventName  string `json:"hook_event_name"`
	SessionID      string `json:"session_id"`
	CWD            string `json:"cwd"`
	TranscriptPath string `json:"transcript_path"`
	TurnID         string `json:"turn_id"`
	StopHookActive bool   `json:"stop_hook_active"`
}

// ReadCodexStopEvent parses a Codex CLI Stop hook event from r.
func ReadCodexStopEvent(r io.Reader) (*CodexStopEvent, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("no data on stdin — openplan codex-plan expects hook JSON from Codex CLI")
	}

	var event CodexStopEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, fmt.Errorf("parsing codex hook event JSON: %w", err)
	}
	return &event, nil
}

// CodexDecisionBuilder formats decisions for Codex CLI's Stop hook
// contract. Approving a turn that already completed means simply not
// blocking it (empty JSON object); denying returns a "block" decision
// with a reason, which Codex feeds back to the model so it revises the
// plan within the same turn.
type CodexDecisionBuilder struct{}

func (CodexDecisionBuilder) BuildApprove(mode string) string {
	return "{}\n"
}

func (CodexDecisionBuilder) BuildDeny(message string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"decision": "block",
		"reason":   message,
	})
	return string(b) + "\n"
}
