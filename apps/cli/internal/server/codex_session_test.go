package server

import (
	"os"
	"path/filepath"
	"testing"
)

func writeRollout(t *testing.T, lines []string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "rollout-test.jsonl")
	content := ""
	for _, l := range lines {
		content += l + "\n"
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

const turnStart = `{"type":"event_msg","payload":{"type":"task_started"}}`

func TestGetLatestCodexPlan_NoPlan(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"just chatting, no plan here"}]}}`,
	})

	_, found := GetLatestCodexPlan(path, "", false)
	if found {
		t.Error("expected no plan found for an ordinary turn")
	}
}

func TestGetLatestCodexPlan_PlanItem(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"# My Plan\nDo the thing."}}}`,
	})

	text, found := GetLatestCodexPlan(path, "", false)
	if !found {
		t.Fatal("expected a plan to be found")
	}
	if text != "# My Plan\nDo the thing." {
		t.Errorf("text = %q", text)
	}
}

func TestGetLatestCodexPlan_ProposedPlanFallback(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Here it is:\n<proposed_plan>\n# Fallback Plan\nSteps here.\n</proposed_plan>"}]}}`,
	})

	text, found := GetLatestCodexPlan(path, "", false)
	if !found {
		t.Fatal("expected a plan to be found via <proposed_plan> fallback")
	}
	if text != "# Fallback Plan\nSteps here." {
		t.Errorf("text = %q", text)
	}
}

func TestGetLatestCodexPlan_PrefersPlanItemOverAssistantMessage(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"<proposed_plan>Old style plan</proposed_plan>"}]}}`,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Structured plan item"}}}`,
	})

	text, found := GetLatestCodexPlan(path, "", false)
	if !found {
		t.Fatal("expected a plan")
	}
	if text != "Structured plan item" {
		t.Errorf("text = %q, want the structured plan-item to win", text)
	}
}

// TestGetLatestCodexPlan_StopHookActive_LoopGuard verifies the critical
// anti-loop behavior: after openplan already blocked once (Stop hook
// re-fires as stop_hook_active=true), an unchanged plan must not
// re-open the review UI.
func TestGetLatestCodexPlan_StopHookActive_NoChangeSinceHookPrompt(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Same plan"}}}`,
		`{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<hook_prompt>please revise</hook_prompt>"}]}}`,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Same plan"}}}`,
	})

	_, found := GetLatestCodexPlan(path, "", true)
	if found {
		t.Error("expected no plan (loop guard) when the plan is unchanged after the hook prompt")
	}
}

func TestGetLatestCodexPlan_StopHookActive_RevisedPlan(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Original plan"}}}`,
		`{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<hook_prompt>please revise</hook_prompt>"}]}}`,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Revised plan"}}}`,
	})

	text, found := GetLatestCodexPlan(path, "", true)
	if !found {
		t.Fatal("expected the revised plan to be surfaced")
	}
	if text != "Revised plan" {
		t.Errorf("text = %q, want %q", text, "Revised plan")
	}
}

func TestGetLatestCodexPlan_StopHookActive_NoPlanSinceHookPrompt(t *testing.T) {
	path := writeRollout(t, []string{
		turnStart,
		`{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Plan","text":"Original plan"}}}`,
		`{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<hook_prompt>please revise</hook_prompt>"}]}}`,
		`{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"still thinking..."}]}}`,
	})

	_, found := GetLatestCodexPlan(path, "", true)
	if found {
		t.Error("expected no plan when nothing new followed the hook prompt")
	}
}

func TestFindCodexRolloutByThreadID_NotFound(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	_, err := FindCodexRolloutByThreadID("nonexistent-thread")
	if err == nil {
		t.Error("expected an error when no rollout exists")
	}
}

func TestFindCodexRolloutByThreadID_Found(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	threadID := "019c42aa-83c1-7c11-a484-af532e8699f9"
	dayDir := filepath.Join(home, ".codex", "sessions", "2026", "02", "09")
	if err := os.MkdirAll(dayDir, 0755); err != nil {
		t.Fatal(err)
	}
	rolloutPath := filepath.Join(dayDir, "rollout-2026-02-09T19-19-57-"+threadID+".jsonl")
	if err := os.WriteFile(rolloutPath, []byte(turnStart+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := FindCodexRolloutByThreadID(threadID)
	if err != nil {
		t.Fatalf("FindCodexRolloutByThreadID: %v", err)
	}
	if got != rolloutPath {
		t.Errorf("got %q, want %q", got, rolloutPath)
	}
}
