package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var contextCmd = &cobra.Command{
	Use:   "context",
	Short: "PreToolUse hook for EnterPlanMode — outputs additionalContext or exits silently",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runContextMode()
	},
}

func runContextMode() error {
	hookFile := filepath.Join(os.Getenv("HOME"), ".openplan", "hooks", "improve-context.md")

	data, err := os.ReadFile(hookFile)
	if err != nil {
		// No hook file configured — exit silently with no output.
		return nil
	}

	content := string(data)
	if content == "" {
		return nil
	}

	output := map[string]interface{}{
		"additionalContext": content,
	}
	encoded, err := json.Marshal(output)
	if err != nil {
		return nil
	}

	fmt.Println(string(encoded))
	return nil
}
