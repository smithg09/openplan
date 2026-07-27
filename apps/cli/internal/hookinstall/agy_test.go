package hookinstall

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEnsureAgyPlanHook_EmptyFile(t *testing.T) {
	out, changed, err := EnsureAgyPlanHook(nil, "openplan agy-plan")
	if err != nil {
		t.Fatalf("EnsureAgyPlanHook: %v", err)
	}
	if !changed {
		t.Error("expected changed=true")
	}
	var data map[string]interface{}
	if err := json.Unmarshal(out, &data); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	if _, ok := data["openplan"]; !ok {
		t.Errorf("openplan key missing: %s", out)
	}
}

func TestEnsureAgyPlanHook_PreservesOtherHookGroups(t *testing.T) {
	existing := []byte(`{
  "my-linter-hook": {
    "PostToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "./scripts/lint.sh", "timeout": 10 } ] }
    ]
  }
}`)
	out, changed, err := EnsureAgyPlanHook(existing, "openplan agy-plan")
	if err != nil {
		t.Fatalf("EnsureAgyPlanHook: %v", err)
	}
	if !changed {
		t.Fatal("expected changed=true")
	}
	if !strings.Contains(string(out), "lint.sh") {
		t.Errorf("existing hook group was dropped: %s", out)
	}
	if !strings.Contains(string(out), "openplan agy-plan") {
		t.Errorf("new hook not added: %s", out)
	}

	var data map[string]interface{}
	if err := json.Unmarshal(out, &data); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	if _, ok := data["my-linter-hook"]; !ok {
		t.Error("my-linter-hook group was dropped")
	}
	if _, ok := data["openplan"]; !ok {
		t.Error("openplan group missing")
	}
}

func TestEnsureAgyPlanHook_Idempotent(t *testing.T) {
	out1, changed1, err := EnsureAgyPlanHook(nil, "openplan agy-plan")
	if err != nil || !changed1 {
		t.Fatalf("first install: changed=%v err=%v", changed1, err)
	}
	out2, changed2, err := EnsureAgyPlanHook(out1, "openplan agy-plan")
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if changed2 {
		t.Error("expected changed=false on re-install with the same command")
	}
	if string(out1) != string(out2) {
		t.Errorf("re-install produced different output:\n%s\nvs\n%s", out1, out2)
	}
}

func TestEnsureAgyPlanHook_UpdatesCommandOnChange(t *testing.T) {
	out1, _, err := EnsureAgyPlanHook(nil, "/old/path/openplan agy-plan")
	if err != nil {
		t.Fatalf("first install: %v", err)
	}
	out2, changed, err := EnsureAgyPlanHook(out1, "/new/path/openplan agy-plan")
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if !changed {
		t.Error("expected changed=true when the command path differs")
	}
	if !strings.Contains(string(out2), "/new/path/openplan agy-plan") {
		t.Errorf("new command not written: %s", out2)
	}
	if strings.Contains(string(out2), "/old/path/openplan agy-plan") {
		t.Errorf("old command should have been replaced: %s", out2)
	}
}

func TestEnsureAgyPlanHook_InvalidJSON(t *testing.T) {
	_, _, err := EnsureAgyPlanHook([]byte("{not json"), "openplan agy-plan")
	if err == nil {
		t.Error("expected an error for invalid existing JSON")
	}
}
