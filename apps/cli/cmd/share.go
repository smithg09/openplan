package cmd

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/atotto/clipboard"
	"github.com/spf13/cobra"
)

const (
	defaultRelayURL = "https://relay-openplan.smithgajjar.dev"
	shareBaseURL    = "https://openplan.smithgajjar.dev"
	inlineThreshold = 30 * 1024 // 30 KB
)

var shareCmd = &cobra.Command{
	Use:    "share <file>",
	Short:  "Share a plan file via a shareable URL",
	Hidden: true,
	Long: `Reads the file, gzip-compresses it, and base64url-encodes it.
If the compressed payload is under 30KB, a fragment URL is printed directly.
Otherwise the payload is uploaded to the relay server and a /p/<token> URL is printed.
The URL is also copied to the clipboard when possible.`,
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

	// Gzip-compress the content.
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(data); err != nil {
		return fmt.Errorf("compressing: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("finalising gzip: %w", err)
	}

	encoded := base64.URLEncoding.EncodeToString(buf.Bytes())

	var shareURL string
	if len(encoded) < inlineThreshold {
		// Inline fragment URL — no server call needed.
		shareURL = shareBaseURL + "/#" + encoded
	} else {
		// Upload to relay.
		relayBase := os.Getenv("OPENPLAN_RELAY_URL")
		if relayBase == "" {
			relayBase = defaultRelayURL
		}
		token, err := postToRelay(relayBase, encoded)
		if err != nil {
			return fmt.Errorf("uploading to relay: %w", err)
		}
		shareURL = shareBaseURL + "/p/" + token
	}

	fmt.Println(shareURL)

	// Copy to clipboard — silently skip on failure (e.g. headless servers).
	if err := clipboard.WriteAll(shareURL); err == nil {
		fmt.Fprintln(os.Stderr, "URL copied to clipboard.")
	}

	return nil
}

func postToRelay(relayBase, content string) (string, error) {
	payload, err := json.Marshal(map[string]string{"content": content})
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(relayBase+"/api/relay/store", "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("relay returned %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parsing relay response: %w", err)
	}
	if result.Token == "" {
		return "", fmt.Errorf("relay returned empty token")
	}
	return result.Token, nil
}
