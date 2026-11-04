// Command opendocs is openplan's sibling for reviewing rich HTML documents:
// agents publish self-contained HTML, people comment on the exact words, and
// every version is kept. This is the local-first binary; it shares the openplan
// Go module but is a distinct entrypoint and release artifact.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"text/tabwriter"

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

// openCmd will open a document in the browser review UI (server step).
var openCmd = &cobra.Command{
	Use:   "open <file.html>",
	Short: "Open a document in the browser review UI",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("opendocs open: the review server lands in the next step of PR 2")
	},
}

// serveCmd will start the persistent local review server (server step).
var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the local review server",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("opendocs serve: the review server lands in the next step of PR 2")
	},
}

func init() {
	createCmd.Flags().String("name", "", "Document name (defaults to the file name)")
	createCmd.Flags().String("label", "", "Short version label")
	createCmd.Flags().String("summary", "", "Change summary")
}
