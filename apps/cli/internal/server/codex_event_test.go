package server

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestReadCodexStopEvent_Valid(t *testing.T) {
	input := `{
		"hook_event_name": "Stop",
		"session_id": "abc-123",
		"cwd": "/home/user/project",
		"transcript_path": "/home/user/.codex/sessions/2026/02/09/rollout-x.jsonl",
		"turn_id": "turn-1",
		"stop_hook_active": true
	}`

	event, err := ReadCodexStopEvent(strings.NewReader(input))
	if err != nil {
		t.Fatalf("ReadCodexStopEvent: %v", err)
	}
	if event.HookEventName != "Stop" {
		t.Errorf("HookEventName = %q", event.HookEventName)
	}
	if !event.StopHookActive {
		t.Error("StopHookActive = false, want true")
	}
	if event.TurnID != "turn-1" {
		t.Errorf("TurnID = %q", event.TurnID)
	}
}

func TestReadCodexStopEvent_EmptyInput(t *testing.T) {
	_, err := ReadCodexStopEvent(strings.NewReader(""))
	if err == nil {
		t.Error("expected error for empty input, got nil")
	}
}

func TestCodexDecisionBuilder_Approve(t *testing.T) {
	d := CodexDecisionBuilder{}.BuildApprove("")
	if strings.TrimSpace(d) != "{}" {
		t.Errorf("approve decision = %q, want empty object", d)
	}
}

func TestCodexDecisionBuilder_Deny(t *testing.T) {
	d := CodexDecisionBuilder{}.BuildDeny("needs work")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["decision"] != "block" {
		t.Errorf("decision = %v, want block", m["decision"])
	}
	if m["reason"] != "needs work" {
		t.Errorf("reason = %v", m["reason"])
	}
}
