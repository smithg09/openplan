package server

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// AntigravityEvent is the JSON Antigravity CLI (agy) sends on stdin to a
// PreToolUse hook command, fired for every tool call the agent makes.
// There is no dedicated plan-approval tool: plan mode calls the generic
// write_to_file tool with ArtifactMetadata.RequestFeedback set, so the
// plan-vs-ordinary-write distinction has to be made from Args, not Name
// alone. Verified against a real `agy` v1.1.7 plan-mode session — see
// antigravityWriteToFileArgs.
type AntigravityEvent struct {
	ToolCall struct {
		Name string          `json:"name"`
		Args json.RawMessage `json:"args"`
	} `json:"toolCall"`
	ConversationID string   `json:"conversationId"`
	WorkspacePaths []string `json:"workspacePaths"`
}

type antigravityWriteToFileArgs struct {
	CodeContent      string `json:"CodeContent"`
	TargetFile       string `json:"TargetFile"`
	ArtifactMetadata struct {
		RequestFeedback bool `json:"RequestFeedback"`
	} `json:"ArtifactMetadata"`
}

// ReadAntigravityEvent parses an Antigravity CLI PreToolUse hook event
// from r.
func ReadAntigravityEvent(r io.Reader) (*AntigravityEvent, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("no data on stdin — openplan agy-plan expects hook JSON from Antigravity CLI")
	}

	var event AntigravityEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, fmt.Errorf("parsing antigravity hook event JSON: %w", err)
	}
	return &event, nil
}

// ExtractAntigravityPlan returns the plan text if this tool call is a
// plan awaiting human feedback: a write_to_file call whose
// ArtifactMetadata.RequestFeedback is true. Ordinary code writes (e.g.
// the actual implementation after plan approval) use the same tool
// without that flag, so the flag — not the tool name — is what
// discriminates a plan from a normal file write.
func ExtractAntigravityPlan(event *AntigravityEvent) (string, bool) {
	if event.ToolCall.Name != "write_to_file" {
		return "", false
	}
	var args antigravityWriteToFileArgs
	if err := json.Unmarshal(event.ToolCall.Args, &args); err != nil {
		return "", false
	}
	if !args.ArtifactMetadata.RequestFeedback {
		return "", false
	}
	content := strings.TrimSpace(args.CodeContent)
	if content == "" {
		return "", false
	}
	return content, true
}

// AntigravityDecisionBuilder formats decisions for Antigravity CLI's
// PreToolUse hook contract.
type AntigravityDecisionBuilder struct{}

func (AntigravityDecisionBuilder) BuildApprove(mode string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"decision": "allow",
	})
	return string(b) + "\n"
}

func (AntigravityDecisionBuilder) BuildDeny(message string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"decision": "deny",
		"reason":   message,
	})
	return string(b) + "\n"
}
