// Package hookinstall writes and merges the hook configuration files each
// agent CLI reads, so users don't have to hand-edit JSON/TOML. Every patch
// function here is a pure, narrowly-scoped transform (not a general-purpose
// parser) operating on the whole existing file content — real installs carry
// substantial unrelated structure (other hooks, plugins, MCP servers), so the
// goal is "add exactly our entry, touch nothing else," not "understand the
// whole format."
package hookinstall

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var tomlSectionHeaderRe = regexp.MustCompile(`^\[([^\]]+)\]\s*$`)
var tomlHooksKeyRe = regexp.MustCompile(`^(\s*hooks\s*=\s*)(\S+)\s*$`)

// EnsureCodexHooksFeature returns config.toml content with
// "[features]\nhooks = true" ensured, preserving every other section,
// key, and comment byte-for-byte. Codex requires this experimental
// feature flag before it will invoke any hooks.json at all.
func EnsureCodexHooksFeature(content string) (newContent string, changed bool) {
	if strings.TrimSpace(content) == "" {
		return "[features]\nhooks = true\n", true
	}

	lines := strings.Split(content, "\n")

	featuresStart := -1
	featuresEnd := len(lines)
	for i, line := range lines {
		if m := tomlSectionHeaderRe.FindStringSubmatch(strings.TrimSpace(line)); m != nil {
			if featuresStart != -1 {
				featuresEnd = i
				break
			}
			if m[1] == "features" {
				featuresStart = i
			}
		}
	}

	if featuresStart == -1 {
		out := content
		if !strings.HasSuffix(out, "\n") {
			out += "\n"
		}
		out += "\n[features]\nhooks = true\n"
		return out, true
	}

	for i := featuresStart + 1; i < featuresEnd; i++ {
		if m := tomlHooksKeyRe.FindStringSubmatch(lines[i]); m != nil {
			if m[2] == "true" {
				return content, false
			}
			lines[i] = m[1] + "true"
			return strings.Join(lines, "\n"), true
		}
	}

	out := make([]string, 0, len(lines)+1)
	out = append(out, lines[:featuresStart+1]...)
	out = append(out, "hooks = true")
	out = append(out, lines[featuresStart+1:]...)
	return strings.Join(out, "\n"), true
}

// EnsureCodexStopHook merges a Stop hook running command into an existing
// (possibly empty, possibly containing unrelated hooks) hooks.json, without
// disturbing any other event or hook entry already present. Idempotent: if
// a Stop hook running the exact same command already exists, it's left
// untouched and changed is false.
func EnsureCodexStopHook(existing []byte, command string) (newContent []byte, changed bool, err error) {
	data, err := decodeJSONObject(existing)
	if err != nil {
		return nil, false, err
	}

	hooks, _ := data["hooks"].(map[string]interface{})
	if hooks == nil {
		hooks = map[string]interface{}{}
	}
	stopGroups, _ := hooks["Stop"].([]interface{})

	if hasCommand(stopGroups, command) {
		out, marshalErr := json.MarshalIndent(data, "", "  ")
		if marshalErr == nil {
			out = append(out, '\n')
		}
		return out, false, marshalErr
	}

	stopGroups = append(stopGroups, map[string]interface{}{
		"hooks": []interface{}{
			map[string]interface{}{
				"type":    "command",
				"command": command,
				"timeout": 345600,
			},
		},
	})
	hooks["Stop"] = stopGroups
	data["hooks"] = hooks

	out, err := json.MarshalIndent(data, "", "  ")
	if err == nil {
		out = append(out, '\n')
	}
	return out, true, err
}

func decodeJSONObject(existing []byte) (map[string]interface{}, error) {
	if len(strings.TrimSpace(string(existing))) == 0 {
		return map[string]interface{}{}, nil
	}
	var data map[string]interface{}
	if err := json.Unmarshal(existing, &data); err != nil {
		return nil, fmt.Errorf("parsing existing hooks.json: %w", err)
	}
	if data == nil {
		data = map[string]interface{}{}
	}
	return data, nil
}

// hasCommand reports whether any hook group in groups already runs command.
func hasCommand(groups []interface{}, command string) bool {
	for _, g := range groups {
		group, ok := g.(map[string]interface{})
		if !ok {
			continue
		}
		cmds, _ := group["hooks"].([]interface{})
		for _, c := range cmds {
			entry, ok := c.(map[string]interface{})
			if !ok {
				continue
			}
			if s, _ := entry["command"].(string); s == command {
				return true
			}
		}
	}
	return false
}
