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
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/auth"
	"github.com/smithg09/openplan/cli/internal/opendocs/server"
	"github.com/smithg09/openplan/cli/internal/opendocs/sqlstore"
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
	addr        string
	dataDir     string
	storeKind   string
	databaseURL string
	jwksURL     string
	authIssuer  string
	limits      = server.DefaultLimits()
	corsOrigins []string
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
	rootCmd.Flags().StringVar(&addr, "addr", defaultAddr(), "listen address (use 0.0.0.0:PORT to expose; put TLS in front). Defaults to 0.0.0.0:$PORT when PORT is set")
	rootCmd.Flags().IntVar(&limits.CreatePerHour, "create-per-hour", limits.CreatePerHour, "max new documents per client IP per hour (0 = unlimited)")
	rootCmd.Flags().IntVar(&limits.WritePerMin, "writes-per-min", limits.WritePerMin, "max other writes per client IP per minute (0 = unlimited)")
	rootCmd.Flags().StringSliceVar(&corsOrigins, "cors-origin", splitEnv("OPENDOCS_CORS_ORIGINS"), "allow this exact origin to call the API from a browser (repeatable; e.g. https://opendocs.smithgajjar.dev). Default $OPENDOCS_CORS_ORIGINS, comma-separated")
	rootCmd.Flags().BoolVar(&limits.TrustProxy, "trust-proxy", false, "take client IP from the last X-Forwarded-For hop (only behind your own reverse proxy)")
	rootCmd.Flags().StringVar(&jwksURL, "auth-jwks-url", firstEnv("OPENDOCS_AUTH_JWKS_URL", "NEON_AUTH_JWKS_URL"), "enable optional sign-in: verify user tokens (Ed25519 JWTs, e.g. Neon Auth) against this JWKS URL (default $OPENDOCS_AUTH_JWKS_URL)")
	rootCmd.Flags().StringVar(&authIssuer, "auth-issuer", os.Getenv("OPENDOCS_AUTH_ISSUER"), "if set, user tokens must carry exactly this issuer (default $OPENDOCS_AUTH_ISSUER)")
	rootCmd.Flags().StringVar(&storeKind, "store", "sqlite", "document storage: sqlite (default), postgres, or fs (plain files)")
	rootCmd.Flags().StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection URL for --store postgres (default $DATABASE_URL)")
	rootCmd.Flags().StringVar(&dataDir, "data", defaultDataDir(), "directory for documents, grants and the signing key")
}

func firstEnv(names ...string) string {
	for _, n := range names {
		if v := os.Getenv(n); v != "" {
			return v
		}
	}
	return ""
}

func splitEnv(name string) []string {
	var out []string
	for _, p := range strings.Split(os.Getenv(name), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func defaultAddr() string {
	if p := os.Getenv("PORT"); p != "" {
		return "0.0.0.0:" + p
	}
	return "127.0.0.1:7435"
}

func defaultDataDir() string {
	if d := os.Getenv("OPENDOCS_DATA"); d != "" {
		return d
	}
	if h, err := os.UserHomeDir(); err == nil {
		return filepath.Join(h, ".opendocs-proxy")
	}
	return ".opendocs-proxy"
}

func run(cmd *cobra.Command, _ []string) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	// The signing key can come from the environment (hosted deploys with an
	// ephemeral disk) or a file under --data.
	var key []byte
	if k := os.Getenv("OPENDOCS_SIGNING_KEY"); k != "" {
		key = []byte(k)
	} else {
		var err error
		if key, err = auth.LoadOrCreateKey(filepath.Join(dataDir, "signing.key")); err != nil {
			return err
		}
	}
	signer, err := auth.NewSigner(key)
	if err != nil {
		return err
	}

	var (
		st     store.Backend
		grants auth.Grants
		owners auth.Owners
	)
	switch storeKind {
	case "sqlite":
		db, err := sqlstore.OpenSQLite(filepath.Join(dataDir, "opendocs.db"))
		if err != nil {
			return err
		}
		defer db.Close()
		st, grants, owners = db, db.Grants(), db.Owners()
	case "postgres":
		if databaseURL == "" {
			return fmt.Errorf("--store postgres needs --database-url or $DATABASE_URL")
		}
		db, err := sqlstore.OpenPostgres(databaseURL)
		if err != nil {
			return err
		}
		defer db.Close()
		st, grants, owners = db, db.Grants(), db.Owners()
	case "fs":
		st = store.NewWithBase(filepath.Join(dataDir, "docs")).Backend()
		grants = auth.NewFileGrants(filepath.Join(dataDir, "grants.json"))
		owners = auth.NewFileOwners(filepath.Join(dataDir, "owners.json"))
	default:
		return fmt.Errorf("unknown --store %q (want sqlite, postgres or fs)", storeKind)
	}

	px := server.NewProxy(st, grants, signer, version).WithLimits(limits).WithCORS(corsOrigins)
	if jwksURL != "" {
		u, err := url.Parse(jwksURL)
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
			return fmt.Errorf("--auth-jwks-url must be an https URL: %q", jwksURL)
		}
		px.WithAccounts(auth.NewJWTVerifier(jwksURL, authIssuer), owners)
		fmt.Fprintln(os.Stderr, "accounts: optional sign-in enabled")
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           px.Handler(),
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
