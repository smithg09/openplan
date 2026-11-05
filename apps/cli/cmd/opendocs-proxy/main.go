// Command opendocs-proxy is the self-hostable multi-tenant opendocs server.
// Documents get opaque server-minted ids and are reached only through
// capability links (viewer / commenter / editor); there are no accounts.
//
// It serves its own copy of the review UI, so UI and API are same-origin.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/server"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
	"github.com/spf13/cobra"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

var (
	addr    string
	dataDir string
)

var rootCmd = &cobra.Command{
	Use:          "opendocs-proxy",
	Short:        "Self-hosted opendocs server with capability-link sharing",
	Version:      version,
	SilenceUsage: true,
	RunE:         run,
}

func init() {
	rootCmd.Version = version
	rootCmd.Flags().StringVar(&addr, "addr", "127.0.0.1:7435", "listen address (use 0.0.0.0:PORT to expose; put TLS in front)")
	rootCmd.Flags().StringVar(&dataDir, "data", defaultDataDir(), "directory for documents, grants and the signing key")
}

func defaultDataDir() string {
	if h, err := os.UserHomeDir(); err == nil {
		return filepath.Join(h, ".opendocs-proxy")
	}
	return ".opendocs-proxy"
}

func run(cmd *cobra.Command, _ []string) error {
	key, err := auth.LoadOrCreateKey(filepath.Join(dataDir, "signing.key"))
	if err != nil {
		return err
	}
	signer, err := auth.NewSigner(key)
	if err != nil {
		return err
	}
	grants := auth.NewFileGrants(filepath.Join(dataDir, "grants.json"))
	st := store.NewWithBase(filepath.Join(dataDir, "docs")).Backend()

	srv := &http.Server{
		Addr:              addr,
		Handler:           server.NewProxy(st, grants, signer, version).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	fmt.Fprintf(os.Stderr, "opendocs-proxy %s listening on http://%s (data: %s)\n", version, addr, dataDir)

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
