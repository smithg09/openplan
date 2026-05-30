package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:    "config",
	Short:  "Open settings UI in browser",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("loading config: %w", err)
		}

		store := storage.New()
		srv := server.NewServeServer(cfg, store, cliVersion)

		port := cfg.ServePort
		if port == 0 {
			port = 7432
		}

		actualPort, err := srv.Start(port)
		if err != nil {
			return fmt.Errorf("starting server: %w", err)
		}

		url := fmt.Sprintf("http://localhost:%d/settings", actualPort)

		sess := &storage.Session{
			PID:       os.Getpid(),
			Port:      actualPort,
			URL:       fmt.Sprintf("http://localhost:%d", actualPort),
			Mode:      "archive",
			Project:   "",
			StartedAt: time.Now().UTC().Format(time.RFC3339),
			Label:     "settings",
		}
		if wErr := storage.WriteSession(sess); wErr != nil {
			fmt.Fprintf(os.Stderr, "openplan: warning: %v\n", wErr)
		}

		if err := openBrowser(cfg.Browser, url); err != nil {
			fmt.Fprintf(os.Stderr, "openplan: open %s manually\n", url)
		}

		// Keep running until Ctrl+C
		select {}
	},
}
