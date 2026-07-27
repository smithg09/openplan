package hookinstall

import "encoding/json"

// EnsureAgyPlanHook merges a PreToolUse hook (matched to write_to_file,
// running command) into an existing hooks.json under a fixed "openplan"
// hook-group key, without disturbing any other hook group already present
// in the file. Idempotent: re-running with the same command is a no-op.
func EnsureAgyPlanHook(existing []byte, command string) (newContent []byte, changed bool, err error) {
	data, err := decodeJSONObject(existing)
	if err != nil {
		return nil, false, err
	}

	desired := map[string]interface{}{
		"PreToolUse": []interface{}{
			map[string]interface{}{
				"matcher": "write_to_file",
				"hooks": []interface{}{
					map[string]interface{}{
						"type":    "command",
						"command": command,
						"timeout": 345600,
					},
				},
			},
		},
	}

	if current, ok := data["openplan"]; ok && jsonEqual(current, desired) {
		out, marshalErr := json.MarshalIndent(data, "", "  ")
		if marshalErr == nil {
			out = append(out, '\n')
		}
		return out, false, marshalErr
	}

	data["openplan"] = desired
	out, err := json.MarshalIndent(data, "", "  ")
	if err == nil {
		out = append(out, '\n')
	}
	return out, true, err
}

// jsonEqual compares two values by their canonical JSON encoding. Map key
// order from encoding/json is deterministic (sorted), so this is a safe
// structural-equality check for the generic map[string]interface{} values
// produced by json.Unmarshal.
func jsonEqual(a, b interface{}) bool {
	aj, err1 := json.Marshal(a)
	bj, err2 := json.Marshal(b)
	if err1 != nil || err2 != nil {
		return false
	}
	return string(aj) == string(bj)
}
