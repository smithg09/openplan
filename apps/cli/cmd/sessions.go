package cmd

import (
	"fmt"

	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var sessionsCmd = &cobra.Command{
	Use:   "sessions",
	Short: "List active openplan sessions",
	RunE: func(cmd *cobra.Command, args []string) error {
		sessions, err := storage.ListSessions()
		if err != nil {
			return fmt.Errorf("listing sessions: %w", err)
		}
		if len(sessions) == 0 {
			fmt.Println("No active openplan sessions.")
			return nil
		}
		fmt.Printf("%-8s %-6s %-10s %s\n", "PID", "PORT", "MODE", "URL")
		for _, s := range sessions {
			fmt.Printf("%-8d %-6d %-10s %s\n", s.PID, s.Port, s.Mode, s.URL)
		}
		return nil
	},
}
