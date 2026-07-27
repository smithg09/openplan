package server

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
)

// CopilotEvent is the JSON GitHub Copilot CLI sends on stdin to a
// preToolUse hook command, fired for every tool call the agent makes.
//
// Copilot also sends toolArgs and timestamp fields, but their wire type
// (string vs. object, int vs. ISO string) isn't reliably documented and
// openplan doesn't need them — omitted so a shape mismatch there can't
// break unmarshaling of the fields that matter.
type CopilotEvent struct {
	ToolName  string `json:"toolName"`
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}

// ReadCopilotEvent parses a Copilot CLI preToolUse hook event from r.
func ReadCopilotEvent(r io.Reader) (*CopilotEvent, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("no data on stdin — openplan copilot-plan expects hook JSON from Copilot CLI")
	}

	var event CopilotEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, fmt.Errorf("parsing copilot hook event JSON: %w", err)
	}
	return &event, nil
}

// CopilotDecisionBuilder formats decisions for Copilot CLI's preToolUse
// hook contract, which is flatter than Claude Code's and uses different
// field names (no hookSpecificOutput wrapper).
type CopilotDecisionBuilder struct{}

func (CopilotDecisionBuilder) BuildApprove(mode string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"permissionDecision": "allow",
	})
	return string(b) + "\n"
}

func (CopilotDecisionBuilder) BuildDeny(message string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"permissionDecision":       "deny",
		"permissionDecisionReason": message,
	})
	return string(b) + "\n"
}

var copilotSessionIDRe = regexp.MustCompile(`(?i)^[a-f0-9-]{36}$`)

// copilotHome returns the Copilot CLI data directory, honoring the
// COPILOT_HOME override the CLI itself respects.
func copilotHome() string {
	if h := os.Getenv("COPILOT_HOME"); h != "" {
		return h
	}
	return filepath.Join(os.Getenv("HOME"), ".copilot")
}

// FindCopilotPlanContent locates the plan.md written by Copilot CLI's plan
// mode. sessionId (from the hook event) is tried first; if that session has
// no plan.md, falls back to the most recently modified plan.md across all
// sessions.
func FindCopilotPlanContent(sessionID string) (string, error) {
	sessionsDir := filepath.Join(copilotHome(), "session-state")

	if sessionID != "" && copilotSessionIDRe.MatchString(sessionID) {
		planPath := filepath.Join(sessionsDir, sessionID, "plan.md")
		if data, err := os.ReadFile(planPath); err == nil {
			return string(data), nil
		}
	}

	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return "", fmt.Errorf("reading copilot session-state dir: %w", err)
	}

	var bestPath string
	var bestModTime int64
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		planPath := filepath.Join(sessionsDir, e.Name(), "plan.md")
		info, statErr := os.Stat(planPath)
		if statErr != nil {
			continue
		}
		if mt := info.ModTime().UnixNano(); bestPath == "" || mt > bestModTime {
			bestPath = planPath
			bestModTime = mt
		}
	}

	if bestPath == "" {
		return "", fmt.Errorf("no plan.md found under %s", sessionsDir)
	}

	data, err := os.ReadFile(bestPath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
