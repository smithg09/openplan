package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/smithg09/openplan/cli/internal/opendocs/search"
	"github.com/smithg09/openplan/cli/internal/opendocs/store"
	"github.com/spf13/cobra"
)

func init() {
	// -word is part of the query language; stop flag parsing at the first
	// argument so `opendocs search beta -outage` is not read as a flag.
	searchCmd.Flags().SetInterspersed(false)
	searchCmd.Flags().Bool("all-projects", false, "search every project, not just the current directory's")
	searchCmd.Flags().Bool("json", false, "print results as JSON")
	rootCmd.AddCommand(searchCmd)
}

type searchHit struct {
	Project string `json:"project"`
	search.Result
}

var searchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search local documents by title and latest text",
	Long: `Finds documents whose title or latest version contains your words.

  every word must appear (a word also matches longer words starting with it)
  "quoted text"  must appear in order
  -word          excludes documents containing it

Put flags before the query (e.g. ` + "`opendocs search --json beta -outage`" + `).

Searches the current directory's project; --all-projects searches everything
under ~/.opendocs. Only local documents are searched.`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		all, _ := cmd.Flags().GetBool("all-projects")
		asJSON, _ := cmd.Flags().GetBool("json")
		q := search.Parse(strings.Join(args, " "))
		if q.Empty() {
			return fmt.Errorf("query needs at least one positive word or phrase")
		}
		st := store.New()
		projects := []string{projectSlug()}
		if all {
			var err error
			if projects, err = st.ListProjects(); err != nil {
				return err
			}
		}
		hits := []searchHit{}
		for _, p := range projects {
			res, err := search.Project(st.Backend(), p, q)
			if err != nil {
				return err
			}
			for _, r := range res {
				hits = append(hits, searchHit{Project: p, Result: r})
			}
		}
		if asJSON {
			return json.NewEncoder(os.Stdout).Encode(hits)
		}
		if len(hits) == 0 {
			fmt.Println("no matches")
			return nil
		}
		for _, h := range hits {
			where := h.Doc
			if all {
				where = h.Project + "/" + h.Doc
			}
			fmt.Printf("%s — %s\n  %s\n", where, h.Title, h.Snippet)
		}
		return nil
	},
}
