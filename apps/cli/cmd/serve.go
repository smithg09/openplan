package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/server"
	"github.com/smithg09/openplan/cli/internal/storage"
	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:     "serve",
	Aliases: []string{"archive"},
	Short:   "Start persistent dashboard server",
	Long:    "Start a persistent Openplan dashboard server and open it in the browser.",
	RunE:    runServe,
}

func init() {
	serveCmd.Flags().StringVar(&browserFlag, "browser", "", "Override which browser to open")
}

func runServe(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	port := cfg.ServePort
	if port == 0 {
		port = 7432
	}

	store := storage.New()
	srv := server.NewServeServer(cfg, store, cliVersion)

	actualPort, err := srv.Start(port)
	if err != nil {
		return fmt.Errorf("starting server: %w", err)
	}

	url := fmt.Sprintf("http://localhost:%d", actualPort)

	// Write session file
	sess := &storage.Session{
		PID:       os.Getpid(),
		Port:      actualPort,
		URL:       url,
		Mode:      "archive",
		Project:   "",
		StartedAt: time.Now().UTC().Format(time.RFC3339),
		Label:     "dashboard",
	}
	if err := storage.WriteSession(sess); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: warning: could not write session file: %v\n", err)
	}

	if browserFlagVal := browserFlag; browserFlagVal != "" {
		cfg.Browser = browserFlagVal
	}
	if err := openBrowser(cfg.Browser, url); err != nil {
		fmt.Fprintf(os.Stderr, "openplan: could not open browser: %v\n", err)
	}

	fmt.Fprintf(os.Stderr, "openplan: dashboard running at %s\n", url)
	fmt.Fprintf(os.Stderr, "openplan: press Ctrl+C to stop\n")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	srv.Stop()
	_ = storage.RemoveSession(os.Getpid())
	fmt.Fprintln(os.Stderr, "\nopenplan: server stopped")
	return nil
}
