package server

import (
	"encoding/json"
	"fmt"
	"io"
)

type HookEvent struct {
	HookEventName string    `json:"hook_event_name"`
	SessionID     string    `json:"session_id"`
	ToolName      string    `json:"tool_name"`
	ToolInput     ToolInput `json:"tool_input"`
	CWD           string    `json:"cwd"`
}

type ToolInput struct {
	Plan string `json:"plan"`
}

func ReadHookEvent(r io.Reader) (*HookEvent, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("no data on stdin — openplan expects hook JSON from Claude Code")
	}

	var event HookEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, fmt.Errorf("parsing hook event JSON: %w", err)
	}
	return &event, nil
}
