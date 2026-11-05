// Command opendocs is openplan's sibling for reviewing rich HTML documents:
// agents publish self-contained HTML, people comment on the exact words, and
// every version is kept. This is the local-first binary; it shares the openplan
// Go module but is a distinct entrypoint and release artifact.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"text/tabwriter"

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

var rootCmd = &cobra.Command{
	Use:          "opendocs",
	Short:        "Review rich HTML documents — publish, comment, version",
	Long:         "opendocs reviews self-contained HTML documents in a browser UI, local-first.\nAgents publish HTML, people comment on the exact words, and every version is kept.",
	Version:      version,
	SilenceUsage: true,
}

func init() {
	rootCmd.Version = version
	rootCmd.AddCommand(createCmd, versionsCmd, commentsCmd, openCmd, serveCmd)
}

// projectSlug derives a stable per-project key from the current directory.
func projectSlug() string {
	cwd, err := os.Getwd()
	if err != nil || cwd == "" {
		return "unknown"
	}
	return store.Slug(cwd)
}

// createCmd snapshots an HTML file as a new version of a document.
var createCmd = &cobra.Command{
	Use:   "create <file.html>",
	Short: "Snapshot an HTML file as a new document version",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		path := args[0]
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}
		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			name = filepath.Base(path)
		}
		label, _ := cmd.Flags().GetString("label")
		summary, _ := cmd.Flags().GetString("summary")

		docSlug := store.Slug(name)
		doc := store.New().Doc(projectSlug(), docSlug)

		var expectedHead string
		if head, err := doc.Head(); err == nil {
			expectedHead = head.ID // chain onto the current head
		}
		v, err := doc.CreateVersion(content, expectedHead, label, summary)
		if err != nil {
			return err
		}
		fmt.Printf("created %s version %s (content %s)\n", docSlug, v.ID, v.ContentHash[:12])
		return nil
	},
}

// versionsCmd lists a document's version history.
var versionsCmd = &cobra.Command{
	Use:   "versions <doc>",
	Short: "List a document's version history",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		doc := store.New().Doc(projectSlug(), store.Slug(args[0]))
		versions, err := doc.ListVersions()
		if err != nil {
			return err
		}
		if len(versions) == 0 {
			fmt.Println("no versions yet")
			return nil
		}
		head, _ := doc.Head()
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tCREATED\tLABEL\tHEAD")
		for _, v := range versions {
			marker := ""
			if v.ID == head.ID {
				marker = "←"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", v.ID, v.CreatedAt, v.Label, marker)
		}
		return w.Flush()
	},
}

// commentsCmd lists a document's comments.
var commentsCmd = &cobra.Command{
	Use:   "comments <doc>",
	Short: "List a document's comments",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		doc := store.New().Doc(projectSlug(), store.Slug(args[0]))
		comments, err := doc.ListComments()
		if err != nil {
			return err
		}
		if len(comments) == 0 {
			fmt.Println("no comments")
			return nil
		}
		for _, c := range comments {
			prefix := "•"
			if c.RootCommentID != "" {
				prefix = "  ↳"
			}
			quote := ""
			if c.Anchor != nil {
				quote = " \"" + c.Anchor.Quote + "\""
			}
			fmt.Printf("%s [%s] %s%s: %s\n", prefix, c.Status, c.Author, quote, c.Body)
		}
		return nil
	},
}

// openCmd snapshots an HTML file (if it changed) and opens it in the browser
// review UI, blocking until interrupted.
var openCmd = &cobra.Command{
	Use:   "open <file.html>",
	Short: "Open a document in the browser review UI",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		path := args[0]
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}
		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			name = filepath.Base(path)
		}
		project := projectSlug()
		docSlug := store.Slug(name)
		doc := store.New().Doc(project, docSlug)

		// Snapshot a new version only when the content differs from head.
		if err := snapshotIfChanged(doc, content); err != nil {
			return err
		}

		srv := server.New(store.New().Backend(), project, version)
		srv.SetFocus(docSlug)
		return ignoreInterrupt(runServer(cmd, srv, "/?doc="+docSlug, false))
	},
}

// serveCmd starts the local review server for the current project.
var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the local review server",
	RunE: func(cmd *cobra.Command, args []string) error {
		srv := server.New(store.New().Backend(), projectSlug(), version)
		return ignoreInterrupt(runServer(cmd, srv, "/", false))
	},
}

// snapshotIfChanged creates a new version unless content matches the head.
func snapshotIfChanged(doc *store.Doc, content []byte) error {
	head, err := doc.Head()
	if err == nil {
		if existing, rerr := doc.ReadVersion(head.ID); rerr == nil && bytes.Equal(existing, content) {
			return nil // unchanged; keep the current head
		}
		if _, cerr := doc.CreateVersion(content, head.ID, "", ""); cerr != nil {
			return cerr
		}
		return nil
	}
	_, cerr := doc.CreateVersion(content, "", "", "")
	return cerr
}

// runServer starts srv, opens the browser at openPath, and blocks until SIGINT
// (returning errInterrupted) or, when untilDone is set, until the reviewer
// submits their review in the UI (returning nil).
func runServer(cmd *cobra.Command, srv *server.Server, openPath string, untilDone bool) error {
	port, _ := cmd.Flags().GetInt("port")
	actual, err := srv.Start(port)
	if err != nil {
		return fmt.Errorf("starting server: %w", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d%s", actual, openPath)

	noBrowser, _ := cmd.Flags().GetBool("no-browser")
	if !noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Fprintf(os.Stderr, "opendocs: could not open browser: %v\n", err)
		}
	}
	fmt.Fprintf(os.Stderr, "opendocs: review server at %s\n", url)
	fmt.Fprintln(os.Stderr, "opendocs: press Ctrl+C to stop")

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	var done <-chan struct{} // nil blocks forever, so plain `open`/`serve` ignore it
	if untilDone {
		done = srv.Done()
	}
	select {
	case <-sig:
		srv.Stop()
		fmt.Fprintln(os.Stderr, "\nopendocs: stopped")
		return errInterrupted
	case <-done:
		srv.Stop()
		return nil
	}
}

// errInterrupted marks a Ctrl+C. `review` treats it as "no review submitted";
// open/serve treat it as a normal exit.
var errInterrupted = fmt.Errorf("interrupted")

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

// ignoreInterrupt turns a Ctrl+C into a clean exit for open/serve.
func ignoreInterrupt(err error) error {
	if errors.Is(err, errInterrupted) {
		return nil
	}
	return err
}

// reviewResult is what `opendocs review` prints on stdout for the agent.
type reviewResult struct {
	Doc       string         `json:"doc"`
	VersionID string         `json:"versionId"`
	Open      []reviewThread `json:"open"`
	Resolved  int            `json:"resolvedCount"`
}

type reviewThread struct {
	ID      string        `json:"id"`
	Quote   string        `json:"quote"`
	Author  string        `json:"author,omitempty"`
	Comment string        `json:"comment"`
	Replies []reviewReply `json:"replies,omitempty"`
}

type reviewReply struct {
	Author  string `json:"author,omitempty"`
	Comment string `json:"comment"`
}

// buildReview summarizes a document's comments: open threads in full, resolved
// threads as a count (the agent only needs to act on what is still open).
func buildReview(doc *store.Doc, docSlug string) (reviewResult, error) {
	res := reviewResult{Doc: docSlug, Open: []reviewThread{}}
	if head, err := doc.Head(); err == nil {
		res.VersionID = head.ID
	}
	comments, err := doc.ListComments()
	if err != nil {
		return res, err
	}
	replies := map[string][]reviewReply{}
	for _, c := range comments {
		if c.RootCommentID != "" {
			replies[c.RootCommentID] = append(replies[c.RootCommentID], reviewReply{Author: c.Author, Comment: c.Body})
		}
	}
	for _, c := range comments {
		if c.RootCommentID != "" {
			continue
		}
		if c.Status == store.StatusResolved {
			res.Resolved++
			continue
		}
		t := reviewThread{ID: c.ID, Author: c.Author, Comment: c.Body, Replies: replies[c.ID]}
		if c.Anchor != nil {
			t.Quote = c.Anchor.Quote
		}
		res.Open = append(res.Open, t)
	}
	return res, nil
}

// reviewCmd opens a document for review and blocks until the reviewer clicks
// "Submit review", then prints the open threads as JSON on stdout so an agent
// can read the feedback without polling.
var reviewCmd = &cobra.Command{
	Use:   "review <file.html>",
	Short: "Open a document, wait for the reviewer to submit, print their comments as JSON",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		path := args[0]
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}
		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			name = filepath.Base(path)
		}
		project := projectSlug()
		docSlug := store.Slug(name)
		doc := store.New().Doc(project, docSlug)
		if err := snapshotIfChanged(doc, content); err != nil {
			return err
		}

		srv := server.New(store.New().Backend(), project, version)
		srv.SetFocus(docSlug)
		if err := runServer(cmd, srv, "/?doc="+docSlug, true); err != nil {
			if errors.Is(err, errInterrupted) {
				return fmt.Errorf("review not submitted (interrupted)")
			}
			return err
		}

		res, err := buildReview(doc, docSlug)
		if err != nil {
			return err
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(res)
	},
}

// restoreCmd makes an earlier version the new head (as a new version).
var restoreCmd = &cobra.Command{
	Use:   "restore <doc> <version-id>",
	Short: "Restore an earlier version as the new head",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		doc := store.New().Doc(projectSlug(), store.Slug(args[0]))
		head, err := doc.Head()
		if err != nil {
			return fmt.Errorf("document has no versions: %w", err)
		}
		v, err := doc.Restore(args[1], head.ID)
		if err != nil {
			return err
		}
		fmt.Printf("restored %s as new version %s\n", args[1], v.ID)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(reviewCmd, restoreCmd)
	reviewCmd.Flags().String("name", "", "Document name (defaults to the file name)")
	reviewCmd.Flags().Int("port", 0, "Preferred port (0 = pick an open one)")
	reviewCmd.Flags().Bool("no-browser", false, "Don't open a browser")

	createCmd.Flags().String("name", "", "Document name (defaults to the file name)")
	createCmd.Flags().String("label", "", "Short version label")
	createCmd.Flags().String("summary", "", "Change summary")

	openCmd.Flags().String("name", "", "Document name (defaults to the file name)")
	for _, c := range []*cobra.Command{openCmd, serveCmd} {
		c.Flags().Int("port", 0, "Preferred port (0 = pick an open one)")
		c.Flags().Bool("no-browser", false, "Don't open a browser")
	}
}
