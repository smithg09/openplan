package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// realPlanWriteEvent is a real PreToolUse payload captured from a live
// `agy` v1.1.7 interactive plan-mode session (via a logging hook), with
// the CodeContent shortened for readability. Field names/casing are
// exactly as agy sent them.
const realPlanWriteEvent = `{
	"artifactDirectoryPath": "/Users/test/.gemini/antigravity-cli/brain/7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4",
	"conversationId": "7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4",
	"modelName": "gemini-3.6-flash-high",
	"stepIdx": 12,
	"toolCall": {
		"args": {
			"ArtifactMetadata": {"RequestFeedback": true, "Summary": "Implementation plan for adding a Hello World shell script.", "UserFacing": true},
			"CodeContent": "# Implementation Plan - Add Hello World Script\nAdd a simple Bash script.",
			"Description": "Create implementation plan for adding a Hello World script",
			"Overwrite": true,
			"TargetFile": "/Users/test/.gemini/antigravity-cli/brain/7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4/hello_world_plan.md"
		},
		"name": "write_to_file"
	},
	"transcriptPath": "/Users/test/.gemini/antigravity-cli/brain/7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4/.system_generated/logs/transcript_full.jsonl",
	"workspacePaths": ["/Users/test/scratch/agy-probe"]
}`

// realOrdinaryWriteEvent is a real PreToolUse payload for the actual
// implementation write that follows plan approval — same tool, no
// ArtifactMetadata.RequestFeedback, so it must NOT be treated as a plan.
const realOrdinaryWriteEvent = `{
	"conversationId": "7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4",
	"stepIdx": 16,
	"toolCall": {
		"args": {
			"CodeContent": "#!/usr/bin/env bash\necho \"Hello, World!\"\n",
			"Description": "Create hello.sh script",
			"Overwrite": true,
			"TargetFile": "/Users/test/scratch/agy-probe/hello.sh"
		},
		"name": "write_to_file"
	},
	"workspacePaths": ["/Users/test/scratch/agy-probe"]
}`

func TestReadAntigravityEvent_RealPlanPayload(t *testing.T) {
	event, err := ReadAntigravityEvent(strings.NewReader(realPlanWriteEvent))
	if err != nil {
		t.Fatalf("ReadAntigravityEvent: %v", err)
	}
	if event.ToolCall.Name != "write_to_file" {
		t.Errorf("ToolCall.Name = %q", event.ToolCall.Name)
	}
	if event.ConversationID != "7fd26e0e-d458-4474-8ef7-e7fa9e6fb8e4" {
		t.Errorf("ConversationID = %q", event.ConversationID)
	}
	if len(event.WorkspacePaths) != 1 || event.WorkspacePaths[0] != "/Users/test/scratch/agy-probe" {
		t.Errorf("WorkspacePaths = %v", event.WorkspacePaths)
	}
}

func TestExtractAntigravityPlan_RealPlanPayload(t *testing.T) {
	event, err := ReadAntigravityEvent(strings.NewReader(realPlanWriteEvent))
	if err != nil {
		t.Fatalf("ReadAntigravityEvent: %v", err)
	}
	text, found := ExtractAntigravityPlan(event)
	if !found {
		t.Fatal("expected the plan write to be detected via RequestFeedback")
	}
	if !strings.Contains(text, "Implementation Plan") {
		t.Errorf("text = %q", text)
	}
}

func TestExtractAntigravityPlan_OrdinaryWriteNotTreatedAsPlan(t *testing.T) {
	event, err := ReadAntigravityEvent(strings.NewReader(realOrdinaryWriteEvent))
	if err != nil {
		t.Fatalf("ReadAntigravityEvent: %v", err)
	}
	_, found := ExtractAntigravityPlan(event)
	if found {
		t.Error("ordinary write_to_file call (no RequestFeedback) must not be treated as a plan")
	}
}

func TestExtractAntigravityPlan_NonWriteToolIgnored(t *testing.T) {
	event := &AntigravityEvent{}
	event.ToolCall.Name = "list_dir"
	event.ToolCall.Args = json.RawMessage(`{"DirectoryPath":"/tmp"}`)

	_, found := ExtractAntigravityPlan(event)
	if found {
		t.Error("non-write_to_file tool calls must never be treated as a plan")
	}
}

func TestAntigravityDecisionBuilder_Approve(t *testing.T) {
	d := AntigravityDecisionBuilder{}.BuildApprove("")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["decision"] != "allow" {
		t.Errorf("decision = %v, want allow", m["decision"])
	}
}

func TestAntigravityDecisionBuilder_Deny(t *testing.T) {
	d := AntigravityDecisionBuilder{}.BuildDeny("needs work")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["decision"] != "deny" {
		t.Errorf("decision = %v, want deny", m["decision"])
	}
	if m["reason"] != "needs work" {
		t.Errorf("reason = %v", m["reason"])
	}
}
