package server

import (
	"strings"
	"testing"
)

func TestReadHookEvent_Valid(t *testing.T) {
	input := `{
		"hook_event_name": "PermissionRequest",
		"session_id": "abc-123",
		"tool_name": "ExitPlanMode",
		"tool_input": {"plan": "# My Plan\nsome content"},
		"cwd": "/home/user/project"
	}`

	event, err := ReadHookEvent(strings.NewReader(input))
	if err != nil {
		t.Fatalf("ReadHookEvent: %v", err)
	}

	if event.HookEventName != "PermissionRequest" {
		t.Errorf("HookEventName = %q, want PermissionRequest", event.HookEventName)
	}
	if event.SessionID != "abc-123" {
		t.Errorf("SessionID = %q, want abc-123", event.SessionID)
	}
	if event.ToolName != "ExitPlanMode" {
		t.Errorf("ToolName = %q, want ExitPlanMode", event.ToolName)
	}
	if event.ToolInput.Plan != "# My Plan\nsome content" {
		t.Errorf("ToolInput.Plan = %q", event.ToolInput.Plan)
	}
	if event.CWD != "/home/user/project" {
		t.Errorf("CWD = %q, want /home/user/project", event.CWD)
	}
}

func TestReadHookEvent_EmptyInput(t *testing.T) {
	_, err := ReadHookEvent(strings.NewReader(""))
	if err == nil {
		t.Error("expected error for empty input, got nil")
	}
}

func TestReadHookEvent_InvalidJSON(t *testing.T) {
	_, err := ReadHookEvent(strings.NewReader("{not valid json}"))
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestReadHookEvent_MissingFields(t *testing.T) {
	// Minimal valid JSON — missing optional fields should not error
	event, err := ReadHookEvent(strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("ReadHookEvent with empty object: %v", err)
	}
	if event.HookEventName != "" || event.ToolName != "" {
		t.Error("expected zero values for missing fields")
	}
}
