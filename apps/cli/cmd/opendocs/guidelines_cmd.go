package main

import (
	_ "embed"
	"fmt"

	"github.com/spf13/cobra"
)

//go:embed guidelines.md
var guidelinesMD string

// guidelinesCmd prints the authoring contract. Skills tell agents to run this
// before writing a document so the rules stay in one versioned place.
var guidelinesCmd = &cobra.Command{
	Use:   "guidelines",
	Short: "Print how to author an opendocs HTML document",
	Args:  cobra.NoArgs,
	Run:   func(cmd *cobra.Command, args []string) { fmt.Print(guidelinesMD) },
}
