package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReadCopilotEvent_Valid(t *testing.T) {
	input := `{
		"toolName": "exit_plan_mode",
		"toolArgs": "{}",
		"cwd": "/home/user/project",
		"timestamp": 1234567890,
		"sessionId": "07b947fe-7e9e-496b-8b92-41820e556a9d"
	}`

	event, err := ReadCopilotEvent(strings.NewReader(input))
	if err != nil {
		t.Fatalf("ReadCopilotEvent: %v", err)
	}
	if event.ToolName != "exit_plan_mode" {
		t.Errorf("ToolName = %q, want exit_plan_mode", event.ToolName)
	}
	if event.CWD != "/home/user/project" {
		t.Errorf("CWD = %q", event.CWD)
	}
	if event.SessionID != "07b947fe-7e9e-496b-8b92-41820e556a9d" {
		t.Errorf("SessionID = %q", event.SessionID)
	}
}

func TestReadCopilotEvent_EmptyInput(t *testing.T) {
	_, err := ReadCopilotEvent(strings.NewReader(""))
	if err == nil {
		t.Error("expected error for empty input, got nil")
	}
}

func TestReadCopilotEvent_InvalidJSON(t *testing.T) {
	_, err := ReadCopilotEvent(strings.NewReader("{not valid json}"))
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestCopilotDecisionBuilder_Approve(t *testing.T) {
	d := CopilotDecisionBuilder{}.BuildApprove("")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["permissionDecision"] != "allow" {
		t.Errorf("permissionDecision = %v, want allow", m["permissionDecision"])
	}
	if _, ok := m["hookSpecificOutput"]; ok {
		t.Error("copilot decision should not have Claude's hookSpecificOutput wrapper")
	}
}

func TestCopilotDecisionBuilder_Deny(t *testing.T) {
	d := CopilotDecisionBuilder{}.BuildDeny("needs work")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["permissionDecision"] != "deny" {
		t.Errorf("permissionDecision = %v, want deny", m["permissionDecision"])
	}
	if m["permissionDecisionReason"] != "needs work" {
		t.Errorf("permissionDecisionReason = %v, want %q", m["permissionDecisionReason"], "needs work")
	}
}

func TestFindCopilotPlanContent_BySessionID(t *testing.T) {
	home := t.TempDir()
	t.Setenv("COPILOT_HOME", home)

	sessionID := "07b947fe-7e9e-496b-8b92-41820e556a9d"
	sessionDir := filepath.Join(home, "session-state", sessionID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		t.Fatal(err)
	}
	want := "# My Plan\nDo the thing."
	if err := os.WriteFile(filepath.Join(sessionDir, "plan.md"), []byte(want), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := FindCopilotPlanContent(sessionID)
	if err != nil {
		t.Fatalf("FindCopilotPlanContent: %v", err)
	}
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestFindCopilotPlanContent_FallsBackToNewest(t *testing.T) {
	home := t.TempDir()
	t.Setenv("COPILOT_HOME", home)

	older := filepath.Join(home, "session-state", "older-session")
	newer := filepath.Join(home, "session-state", "newer-session")
	if err := os.MkdirAll(older, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(newer, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(older, "plan.md"), []byte("old plan"), 0644); err != nil {
		t.Fatal(err)
	}
	// Ensure a distinct, later mtime for the "newer" plan.
	newerPath := filepath.Join(newer, "plan.md")
	if err := os.WriteFile(newerPath, []byte("new plan"), 0644); err != nil {
		t.Fatal(err)
	}
	future := time.Now().Add(time.Hour)
	if err := os.Chtimes(newerPath, future, future); err != nil {
		t.Fatal(err)
	}

	// No sessionID provided — must fall back to newest plan.md.
	got, err := FindCopilotPlanContent("")
	if err != nil {
		t.Fatalf("FindCopilotPlanContent: %v", err)
	}
	if got != "new plan" {
		t.Errorf("got %q, want %q", got, "new plan")
	}
}

func TestFindCopilotPlanContent_RejectsPathTraversal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("COPILOT_HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "session-state"), 0755); err != nil {
		t.Fatal(err)
	}

	// A malicious sessionId must not escape session-state/ via path traversal,
	// and must fail the UUID shape check outright.
	_, err := FindCopilotPlanContent("../../../etc/passwd")
	if err == nil {
		t.Error("expected error for malformed sessionId with no plan.md present")
	}
}
