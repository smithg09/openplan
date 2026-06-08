package cmd

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/atotto/clipboard"
	"github.com/spf13/cobra"
)

const shareBaseURL = "https://openplan.smithgajjar.dev"

type sharePayload struct {
	Version     int    `json:"version"`
	Title       string `json:"title"`
	Plan        string `json:"plan"`
	Annotations []any  `json:"annotations"`
}

var shareCmd = &cobra.Command{
	Use:   "share <file>",
	Short: "Generate a shareable link for a plan file",
	Long: `Encodes the plan file into a self-contained URL that can be shared with
collaborators. Recipients can open the link in any browser to view the plan
and add annotations — no account or installation required.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runShare(args[0])
	},
}

func init() {
	rootCmd.AddCommand(shareCmd)
}

func runShare(filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("reading file: %w", err)
	}

	content := string(data)
	title := deriveTitleFromContent(content, filePath)

	payload := sharePayload{
		Version:     1,
		Title:       title,
		Plan:        content,
		Annotations: []any{},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding payload: %w", err)
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(jsonBytes); err != nil {
		return fmt.Errorf("compressing: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("finalising gzip: %w", err)
	}

	encoded := base64.RawURLEncoding.EncodeToString(buf.Bytes())
	shareURL := shareBaseURL + "/app#share?hash=" + encoded

	clipped := clipboard.WriteAll(shareURL) == nil

	fmt.Println()
	fmt.Println("  ✓ Share link generated")
	fmt.Println()
	fmt.Println(" ", shareURL)
	fmt.Println()
	if clipped {
		fmt.Println("  (copied to clipboard)")
		fmt.Println()
	}
	fmt.Println("  Send this link to collaborators — they can view the plan and")
	fmt.Println("  add annotations directly in the browser. No account required.")
	fmt.Println()

	return nil
}

func deriveTitleFromContent(content, filePath string) string {
	for _, line := range strings.SplitN(content, "\n", 20) {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	base := filepath.Base(filePath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}
