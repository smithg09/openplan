package hookinstall

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEnsureCodexHooksFeature_EmptyFile(t *testing.T) {
	out, changed := EnsureCodexHooksFeature("")
	if !changed {
		t.Error("expected changed=true for empty file")
	}
	if out != "[features]\nhooks = true\n" {
		t.Errorf("out = %q", out)
	}
}

func TestEnsureCodexHooksFeature_NoFeaturesSection(t *testing.T) {
	input := `model = "gpt-5.5"

[projects."/some/path"]
trust_level = "trusted"
`
	out, changed := EnsureCodexHooksFeature(input)
	if !changed {
		t.Fatal("expected changed=true")
	}
	if !strings.Contains(out, `model = "gpt-5.5"`) {
		t.Error("existing content was not preserved")
	}
	if !strings.Contains(out, `trust_level = "trusted"`) {
		t.Error("existing section was not preserved")
	}
	if !strings.Contains(out, "[features]\nhooks = true") {
		t.Errorf("features section not appended correctly: %q", out)
	}
}

func TestEnsureCodexHooksFeature_FeaturesSectionMissingKey(t *testing.T) {
	input := `[features]
js_repl = false

[desktop]
followUpQueueMode = "queue"
`
	out, changed := EnsureCodexHooksFeature(input)
	if !changed {
		t.Fatal("expected changed=true")
	}
	if !strings.Contains(out, "hooks = true") {
		t.Errorf("hooks key not inserted: %q", out)
	}
	if !strings.Contains(out, "js_repl = false") {
		t.Error("existing key in [features] was dropped")
	}
	if !strings.Contains(out, `followUpQueueMode = "queue"`) {
		t.Error("subsequent section was disturbed")
	}
	// The [desktop] section must not have been merged into or after
	// modified content in a way that duplicates or misplaces it.
	if strings.Count(out, "[desktop]") != 1 {
		t.Errorf("expected exactly one [desktop] section, got: %q", out)
	}
	if strings.Count(out, "[features]") != 1 {
		t.Errorf("expected exactly one [features] section, got: %q", out)
	}
}

func TestEnsureCodexHooksFeature_HooksFalseFlippedToTrue(t *testing.T) {
	input := `[features]
hooks = false
js_repl = true
`
	out, changed := EnsureCodexHooksFeature(input)
	if !changed {
		t.Fatal("expected changed=true")
	}
	if strings.Contains(out, "hooks = false") {
		t.Error("hooks = false was not flipped")
	}
	if !strings.Contains(out, "hooks = true") {
		t.Error("hooks = true not present")
	}
	if !strings.Contains(out, "js_repl = true") {
		t.Error("sibling key was dropped")
	}
}

func TestEnsureCodexHooksFeature_AlreadyTrue_NoOp(t *testing.T) {
	input := `[features]
hooks = true
`
	out, changed := EnsureCodexHooksFeature(input)
	if changed {
		t.Error("expected changed=false when hooks is already true")
	}
	if out != input {
		t.Error("content should be byte-identical when no change is needed")
	}
}

func TestEnsureCodexHooksFeature_RealisticMultiSectionFile(t *testing.T) {
	input := `model = "gpt-5.5"

[plugins."github@openai-curated"]
enabled = true

[marketplaces.openai-bundled]
last_updated = "2026-07-14T05:56:48Z"

[projects."/Users/smithg09/Smith/Projects/arcgentic"]
trust_level = "trusted"

[features]
js_repl = false

[mcp_servers.node_repl]
args = []
command = "/some/path"
`
	out, changed := EnsureCodexHooksFeature(input)
	if !changed {
		t.Fatal("expected changed=true")
	}
	for _, want := range []string{
		`model = "gpt-5.5"`,
		`[plugins."github@openai-curated"]`,
		`[marketplaces.openai-bundled]`,
		`trust_level = "trusted"`,
		`js_repl = false`,
		`hooks = true`,
		`[mcp_servers.node_repl]`,
		`command = "/some/path"`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q\nfull output:\n%s", want, out)
		}
	}
	if strings.Count(out, "[features]") != 1 {
		t.Errorf("expected exactly one [features] section, got: %s", out)
	}
	if strings.Count(out, "[mcp_servers.node_repl]") != 1 {
		t.Errorf("expected exactly one [mcp_servers.node_repl] section, got: %s", out)
	}
}

func TestEnsureCodexStopHook_EmptyFile(t *testing.T) {
	out, changed, err := EnsureCodexStopHook(nil, "openplan codex-plan")
	if err != nil {
		t.Fatalf("EnsureCodexStopHook: %v", err)
	}
	if !changed {
		t.Error("expected changed=true")
	}
	var data map[string]interface{}
	if err := json.Unmarshal(out, &data); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	if !strings.Contains(string(out), "openplan codex-plan") {
		t.Errorf("command not present: %s", out)
	}
}

func TestEnsureCodexStopHook_PreservesExistingHook(t *testing.T) {
	existing := []byte(`{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "/Users/x/.local/bin/plannotator", "timeout": 345600 } ] }
    ]
  }
}`)
	out, changed, err := EnsureCodexStopHook(existing, "openplan codex-plan")
	if err != nil {
		t.Fatalf("EnsureCodexStopHook: %v", err)
	}
	if !changed {
		t.Fatal("expected changed=true")
	}
	if !strings.Contains(string(out), "plannotator") {
		t.Errorf("existing hook was dropped: %s", out)
	}
	if !strings.Contains(string(out), "openplan codex-plan") {
		t.Errorf("new hook not added: %s", out)
	}

	var data map[string]interface{}
	if err := json.Unmarshal(out, &data); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	stopGroups := data["hooks"].(map[string]interface{})["Stop"].([]interface{})
	if len(stopGroups) != 2 {
		t.Errorf("expected 2 Stop hook groups (existing + new), got %d", len(stopGroups))
	}
}

func TestEnsureCodexStopHook_Idempotent(t *testing.T) {
	out1, changed1, err := EnsureCodexStopHook(nil, "openplan codex-plan")
	if err != nil || !changed1 {
		t.Fatalf("first install: changed=%v err=%v", changed1, err)
	}
	out2, changed2, err := EnsureCodexStopHook(out1, "openplan codex-plan")
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if changed2 {
		t.Error("expected changed=false on re-install with the same command")
	}
	var data map[string]interface{}
	if err := json.Unmarshal(out2, &data); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	stopGroups := data["hooks"].(map[string]interface{})["Stop"].([]interface{})
	if len(stopGroups) != 1 {
		t.Errorf("expected exactly 1 Stop hook group after re-install, got %d", len(stopGroups))
	}
}

func TestEnsureCodexStopHook_InvalidJSON(t *testing.T) {
	_, _, err := EnsureCodexStopHook([]byte("{not json"), "openplan codex-plan")
	if err == nil {
		t.Error("expected an error for invalid existing JSON")
	}
}
