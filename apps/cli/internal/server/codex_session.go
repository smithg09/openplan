package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// codexRolloutEntry is one JSONL line from a Codex rollout transcript.
// Different entry types populate different subsets of Payload's fields;
// unused fields simply stay at their zero value.
type codexRolloutEntry struct {
	Type    string `json:"type"`
	Payload struct {
		Type    string `json:"type"`
		Role    string `json:"role"`
		TurnID  string `json:"turn_id"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Item struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"item"`
	} `json:"payload"`
}

type codexPlanCandidate struct {
	index  int
	text   string
	source string // "plan-item" or "assistant-message"
}

var turnStartTypes = map[string]bool{"task_started": true, "turn_started": true}
var proposedPlanRe = regexp.MustCompile(`(?is)<proposed_plan>(.*?)</proposed_plan>`)

// FindCodexRolloutByThreadID scans ~/.codex/sessions/YYYY/MM/DD/ (most
// recent first) for a rollout-<timestamp>-<threadID>.jsonl file.
func FindCodexRolloutByThreadID(threadID string) (string, error) {
	sessionsDir := filepath.Join(os.Getenv("HOME"), ".codex", "sessions")

	years, err := sortedDirEntriesDesc(sessionsDir)
	if err != nil {
		return "", err
	}
	for _, year := range years {
		yearDir := filepath.Join(sessionsDir, year)
		months, err := sortedDirEntriesDesc(yearDir)
		if err != nil {
			continue
		}
		for _, month := range months {
			monthDir := filepath.Join(yearDir, month)
			days, err := sortedDirEntriesDesc(monthDir)
			if err != nil {
				continue
			}
			for _, day := range days {
				dayDir := filepath.Join(monthDir, day)
				entries, err := os.ReadDir(dayDir)
				if err != nil {
					continue
				}
				for _, e := range entries {
					name := e.Name()
					if strings.HasSuffix(name, ".jsonl") && strings.Contains(name, threadID) {
						return filepath.Join(dayDir, name), nil
					}
				}
			}
		}
	}
	return "", fmt.Errorf("no rollout found for thread %s", threadID)
}

func sortedDirEntriesDesc(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	return names, nil
}

func parseCodexRolloutEntries(rolloutPath string) ([]codexRolloutEntry, error) {
	f, err := os.Open(rolloutPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var entries []codexRolloutEntry
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry codexRolloutEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		entries = append(entries, entry)
	}
	return entries, scanner.Err()
}

func codexMessageText(entry codexRolloutEntry, allowedContentTypes map[string]bool) (string, bool) {
	if entry.Type != "response_item" || entry.Payload.Type != "message" {
		return "", false
	}
	var parts []string
	for _, block := range entry.Payload.Content {
		if allowedContentTypes[block.Type] && strings.TrimSpace(block.Text) != "" {
			parts = append(parts, strings.TrimSpace(block.Text))
		}
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, "\n"), true
}

func extractLastProposedPlan(text string) (string, bool) {
	matches := proposedPlanRe.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return "", false
	}
	latest := strings.TrimSpace(matches[len(matches)-1][1])
	if latest == "" {
		return "", false
	}
	return latest, true
}

func normalizeCodexPlan(text string) string {
	return strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
}

func findLastCodexIndex(entries []codexRolloutEntry, predicate func(codexRolloutEntry) bool) int {
	for i := len(entries) - 1; i >= 0; i-- {
		if predicate(entries[i]) {
			return i
		}
	}
	return -1
}

func findCodexTurnStartIndex(entries []codexRolloutEntry, turnID string) int {
	if i := findLastCodexIndex(entries, func(e codexRolloutEntry) bool {
		return e.Type == "event_msg" && turnStartTypes[e.Payload.Type] && (turnID == "" || e.Payload.TurnID == turnID)
	}); i != -1 {
		return i
	}
	if i := findLastCodexIndex(entries, func(e codexRolloutEntry) bool {
		return e.Type == "turn_context" && (turnID == "" || e.Payload.TurnID == turnID)
	}); i != -1 {
		return i
	}
	if i := findLastCodexIndex(entries, func(e codexRolloutEntry) bool {
		return e.Type == "event_msg" && turnStartTypes[e.Payload.Type]
	}); i != -1 {
		return i
	}
	if i := findLastCodexIndex(entries, func(e codexRolloutEntry) bool {
		return e.Type == "turn_context"
	}); i != -1 {
		return i
	}
	return 0
}

func isCodexHookPromptMessage(entry codexRolloutEntry) bool {
	if entry.Type != "response_item" || entry.Payload.Type != "message" || entry.Payload.Role != "user" {
		return false
	}
	text, ok := codexMessageText(entry, map[string]bool{"input_text": true})
	return ok && strings.Contains(text, "<hook_prompt")
}

func findLastCodexHookPromptIndex(entries []codexRolloutEntry, startIndex int) int {
	if startIndex < 0 {
		startIndex = 0
	}
	for i := len(entries) - 1; i >= startIndex; i-- {
		if isCodexHookPromptMessage(entries[i]) {
			return i
		}
	}
	return -1
}

func codexPlanItemText(entry codexRolloutEntry, turnID string) (string, bool) {
	if entry.Type != "event_msg" || entry.Payload.Type != "item_completed" {
		return "", false
	}
	if turnID != "" && entry.Payload.TurnID != turnID {
		return "", false
	}
	itemType := entry.Payload.Item.Type
	if itemType != "Plan" && itemType != "plan" {
		return "", false
	}
	text := strings.TrimSpace(entry.Payload.Item.Text)
	if text == "" {
		return "", false
	}
	return text, true
}

func codexAssistantProposedPlanText(entry codexRolloutEntry) (string, bool) {
	if entry.Payload.Role != "assistant" {
		return "", false
	}
	text, ok := codexMessageText(entry, map[string]bool{"output_text": true})
	if !ok {
		return "", false
	}
	return extractLastProposedPlan(text)
}

func collectCodexPlanCandidates(entries []codexRolloutEntry, startIndex int, turnID string) []codexPlanCandidate {
	if startIndex < 0 {
		startIndex = 0
	}
	var candidates []codexPlanCandidate
	for i := startIndex; i < len(entries); i++ {
		entry := entries[i]
		if text, ok := codexPlanItemText(entry, turnID); ok {
			candidates = append(candidates, codexPlanCandidate{index: i, text: text, source: "plan-item"})
		}
		if text, ok := codexAssistantProposedPlanText(entry); ok {
			candidates = append(candidates, codexPlanCandidate{index: i, text: text, source: "assistant-message"})
		}
	}
	return candidates
}

func pickLatestPreferredCodexPlan(candidates []codexPlanCandidate) *codexPlanCandidate {
	for i := len(candidates) - 1; i >= 0; i-- {
		if candidates[i].source == "plan-item" {
			c := candidates[i]
			return &c
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	c := candidates[len(candidates)-1]
	return &c
}

// GetLatestCodexPlan extracts the latest proposed plan from a Codex
// rollout transcript for the turn identified by turnID (or the most
// recent turn, if turnID is empty).
//
// Primary source: persisted TurnItem::Plan events. Fallback: a
// <proposed_plan> block inside a raw assistant message.
//
// When stopHookActive is true, this is a Stop hook re-invocation after
// openplan already blocked once — Codex re-fires Stop after the model
// responds to the block. To avoid re-opening the review UI in a loop,
// this only returns a plan if it's new (appeared after the last
// "<hook_prompt" message) and different from what was shown before.
func GetLatestCodexPlan(rolloutPath, turnID string, stopHookActive bool) (string, bool) {
	entries, err := parseCodexRolloutEntries(rolloutPath)
	if err != nil || len(entries) == 0 {
		return "", false
	}

	turnStartIndex := findCodexTurnStartIndex(entries, turnID)
	candidates := collectCodexPlanCandidates(entries, turnStartIndex, turnID)
	if len(candidates) == 0 {
		return "", false
	}

	if !stopHookActive {
		latest := pickLatestPreferredCodexPlan(candidates)
		if latest == nil {
			return "", false
		}
		return latest.text, true
	}

	lastHookPromptIndex := findLastCodexHookPromptIndex(entries, turnStartIndex)
	if lastHookPromptIndex == -1 {
		latest := pickLatestPreferredCodexPlan(candidates)
		if latest == nil {
			return "", false
		}
		return latest.text, true
	}

	var after, before []codexPlanCandidate
	for _, c := range candidates {
		if c.index > lastHookPromptIndex {
			after = append(after, c)
		} else if c.index < lastHookPromptIndex {
			before = append(before, c)
		}
	}
	if len(after) == 0 {
		return "", false
	}

	latestAfter := pickLatestPreferredCodexPlan(after)
	if latestAfter == nil {
		return "", false
	}
	if latestBefore := pickLatestPreferredCodexPlan(before); latestBefore != nil {
		if normalizeCodexPlan(latestBefore.text) == normalizeCodexPlan(latestAfter.text) {
			return "", false
		}
	}
	return latestAfter.text, true
}
