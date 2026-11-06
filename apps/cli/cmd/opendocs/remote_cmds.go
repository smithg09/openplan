package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/smithg09/openplan/cli/internal/opendocs/remote"
	"github.com/spf13/cobra"
)

func init() {
	publishCmd.Flags().String("proxy", "", "opendocs-proxy URL (default: $OPENDOCS_PROXY, then `opendocs config proxy`)")
	publishCmd.Flags().String("label", "", "short label for this version")
	publishCmd.Flags().String("summary", "", "what changed (one change per line)")
	publishCmd.Flags().Bool("json", false, "print the result as JSON")
	feedbackCmd.Flags().String("proxy", "", "opendocs-proxy URL (default: where the file was published)")
	rootCmd.AddCommand(publishCmd, feedbackCmd, configCmd)
	configCmd.AddCommand(configProxyCmd)
}

func absPath(p string) (string, error) { return filepath.Abs(p) }

type publishResult struct {
	Doc       string `json:"doc"`
	Proxy     string `json:"proxy"`
	VersionID string `json:"versionId"`
	New       bool   `json:"new"`                     // true when this created the document
	Viewer    string `json:"viewerLink,omitempty"`    // only on first publish
	Commenter string `json:"commenterLink,omitempty"` // only on first publish
	Editor    string `json:"editorLink,omitempty"`    // only on first publish; keep private
}

// publishCmd uploads a file to a proxy: the first time it creates the document
// and prints share links; afterwards it adds a new version to the same one.
var publishCmd = &cobra.Command{
	Use:   "publish <file.html>",
	Short: "Publish an HTML file to an opendocs-proxy and print share links",
	Long: `Uploads the file to a proxy. The first publish creates the document and prints
viewer / commenter / editor links; running it again on the same file adds a new
version to the same document. Links are capability links: anyone holding one
has that role, so share the viewer/commenter link and keep the editor link private.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		file, err := absPath(args[0])
		if err != nil {
			return err
		}
		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("reading %s: %w", args[0], err)
		}
		st := remote.NewState()
		flagProxy, _ := cmd.Flags().GetString("proxy")
		label, _ := cmd.Flags().GetString("label")
		summary, _ := cmd.Flags().GetString("summary")
		asJSON, _ := cmd.Flags().GetBool("json")

		prev, published, err := st.Lookup(file)
		if err != nil {
			return err
		}
		proxyURL := prev.Proxy
		if !published || flagProxy != "" {
			if proxyURL, err = st.Proxy(flagProxy); err != nil {
				return err
			}
			if published && prev.Proxy != proxyURL {
				published = false // a different proxy: start a new document there
			}
		}
		c, err := remote.NewClient(proxyURL)
		if err != nil {
			return err
		}

		res := publishResult{Proxy: c.Base}
		if published {
			v, err := c.PublishVersion(prev.ID, prev.EditorToken, string(content), label, summary)
			if err != nil {
				return err
			}
			res.Doc, res.VersionID = prev.ID, v.ID
		} else {
			created, err := c.CreateDoc(string(content), label, summary)
			if err != nil {
				return err
			}
			res.Doc, res.New = created.ID, true
			if created.Version != nil {
				res.VersionID = created.Version.ID
			}
			if err := st.Remember(file, remote.Published{Proxy: c.Base, ID: created.ID, EditorToken: created.EditorToken}); err != nil {
				return fmt.Errorf("published, but could not save state (links below are the only copy): %w", err)
			}
			res.Editor = c.ShareURL(created.ID, created.EditorToken)
			if t, err := c.MintShare(created.ID, created.EditorToken, "commenter", "commenter link"); err == nil {
				res.Commenter = c.ShareURL(created.ID, t)
			}
			if t, err := c.MintShare(created.ID, created.EditorToken, "viewer", "viewer link"); err == nil {
				res.Viewer = c.ShareURL(created.ID, t)
			}
		}

		if asJSON {
			return json.NewEncoder(os.Stdout).Encode(res)
		}
		if res.New {
			fmt.Printf("published %s\n  commenter link: %s\n  viewer link:    %s\n  editor link (keep private): %s\n", res.Doc, res.Commenter, res.Viewer, res.Editor)
		} else {
			fmt.Printf("published new version %s of %s on %s\n", res.VersionID, res.Doc, res.Proxy)
		}
		return nil
	},
}

// feedbackCmd prints the open comment threads for a published file as JSON.
var feedbackCmd = &cobra.Command{
	Use:   "feedback <file.html>",
	Short: "Print open comment threads for a file published to a proxy (JSON)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		file, err := absPath(args[0])
		if err != nil {
			return err
		}
		prev, ok, err := remote.NewState().Lookup(file)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("%s has not been published; run `opendocs publish` first (or use `opendocs review` for local review)", args[0])
		}
		c, err := remote.NewClient(prev.Proxy)
		if err != nil {
			return err
		}
		comments, err := c.Comments(prev.ID, prev.EditorToken)
		if err != nil {
			return err
		}
		head, _ := c.Head(prev.ID, prev.EditorToken)
		return json.NewEncoder(os.Stdout).Encode(summarizeReview(comments, prev.ID, head))
	},
}

var configCmd = &cobra.Command{Use: "config", Short: "View or change opendocs settings"}

var configProxyCmd = &cobra.Command{
	Use:   "proxy [url]",
	Short: "Show or set the default opendocs-proxy (use \"\" to clear)",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		st := remote.NewState()
		if len(args) == 0 {
			p, err := st.Proxy("")
			if err != nil {
				return err
			}
			fmt.Println(p)
			return nil
		}
		if args[0] != "" {
			if _, err := remote.NewClient(args[0]); err != nil {
				return err
			}
		}
		return st.SetProxy(args[0])
	},
}

func userHome() string { h, _ := os.UserHomeDir(); return h }
