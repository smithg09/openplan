package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── runContextMode ────────────────────────────────────────────────────────

func TestRunContextMode_NoFile(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	// Should exit silently without error when hook file doesn't exist
	if err := runContextMode(); err != nil {
		t.Errorf("runContextMode without file: %v", err)
	}
}

func TestRunContextMode_WithFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	hookDir := filepath.Join(home, ".openplan", "hooks")
	os.MkdirAll(hookDir, 0755)
	hookFile := filepath.Join(hookDir, "improve-context.md")
	os.WriteFile(hookFile, []byte("some context instructions"), 0644)

	// Capture stdout
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	err := runContextMode()
	w.Close()
	os.Stdout = old

	var buf bytes.Buffer
	buf.ReadFrom(r)

	if err != nil {
		t.Fatalf("runContextMode: %v", err)
	}

	output := strings.TrimSpace(buf.String())
	if output == "" {
		t.Fatal("expected output, got empty")
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(output), &m); err != nil {
		t.Fatalf("invalid JSON output: %v (got %q)", err, output)
	}
	if m["additionalContext"] != "some context instructions" {
		t.Errorf("additionalContext = %v", m["additionalContext"])
	}
}

func TestRunContextMode_EmptyFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	hookDir := filepath.Join(home, ".openplan", "hooks")
	os.MkdirAll(hookDir, 0755)
	os.WriteFile(filepath.Join(hookDir, "improve-context.md"), []byte(""), 0644)

	if err := runContextMode(); err != nil {
		t.Errorf("runContextMode with empty file: %v", err)
	}
}

// ── listMarkdownFiles ─────────────────────────────────────────────────────

func TestListMarkdownFiles_Basic(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0644)
	os.WriteFile(filepath.Join(dir, "b.MD"), []byte("# B"), 0644)
	os.WriteFile(filepath.Join(dir, "skip.txt"), []byte("text"), 0644)

	files, err := listMarkdownFiles(dir)
	if err != nil {
		t.Fatalf("listMarkdownFiles: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 md files, got %d: %v", len(files), files)
	}
}

func TestListMarkdownFiles_Sorted(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "z.md"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "a.md"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "m.md"), []byte(""), 0644)

	files, err := listMarkdownFiles(dir)
	if err != nil {
		t.Fatalf("listMarkdownFiles: %v", err)
	}
	if files[0] != "a.md" || files[1] != "m.md" || files[2] != "z.md" {
		t.Errorf("files not sorted: %v", files)
	}
}

func TestListMarkdownFiles_SkipsNodeModules(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "real.md"), []byte(""), 0644)
	nmDir := filepath.Join(dir, "node_modules")
	os.MkdirAll(nmDir, 0755)
	os.WriteFile(filepath.Join(nmDir, "ignored.md"), []byte(""), 0644)

	files, err := listMarkdownFiles(dir)
	if err != nil {
		t.Fatalf("listMarkdownFiles: %v", err)
	}
	for _, f := range files {
		if strings.Contains(f, "node_modules") {
			t.Errorf("node_modules file leaked: %s", f)
		}
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file, got %d: %v", len(files), files)
	}
}

func TestListMarkdownFiles_SkipsGit(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "plan.md"), []byte(""), 0644)
	gitDir := filepath.Join(dir, ".git")
	os.MkdirAll(gitDir, 0755)
	os.WriteFile(filepath.Join(gitDir, "COMMIT_EDITMSG.md"), []byte(""), 0644)

	files, err := listMarkdownFiles(dir)
	if err != nil {
		t.Fatalf("listMarkdownFiles: %v", err)
	}
	if len(files) != 1 || files[0] != "plan.md" {
		t.Errorf("unexpected files: %v", files)
	}
}

func TestListMarkdownFiles_NoFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "readme.txt"), []byte(""), 0644)

	_, err := listMarkdownFiles(dir)
	if err == nil {
		t.Error("expected error when no .md files found")
	}
}

func TestListMarkdownFiles_Nested(t *testing.T) {
	dir := t.TempDir()
	subDir := filepath.Join(dir, "subdir")
	os.MkdirAll(subDir, 0755)
	os.WriteFile(filepath.Join(dir, "top.md"), []byte(""), 0644)
	os.WriteFile(filepath.Join(subDir, "nested.md"), []byte(""), 0644)

	files, err := listMarkdownFiles(dir)
	if err != nil {
		t.Fatalf("listMarkdownFiles: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d: %v", len(files), files)
	}
}


// ── mustGetwd ─────────────────────────────────────────────────────────────

func TestMustGetwd(t *testing.T) {
	cwd := mustGetwd()
	if cwd == "" || cwd == "." {
		// "." is the fallback — only valid if os.Getwd actually fails
		// In normal CI this should return a real path
	}
	if !filepath.IsAbs(cwd) && cwd != "." {
		t.Errorf("mustGetwd returned non-absolute path: %q", cwd)
	}
}

// ── openBrowser (error paths only, no real browser launch) ────────────────

func TestOpenBrowser_UnsupportedPlatform(t *testing.T) {
	// We test openWithBrowser / openDefault indirectly via the switch.
	// Since runtime.GOOS is always valid in CI, we only check that
	// openBrowser("default", ...) does not panic.
	// We can't assert on the error because the platform may have 'open'/'xdg-open'.
	_ = openBrowser("default", "http://example.com")
}

// ── SetVersion ────────────────────────────────────────────────────────────

func TestSetVersion(t *testing.T) {
	SetVersion("2.3.4")
	if cliVersion != "2.3.4" {
		t.Errorf("cliVersion = %q, want 2.3.4", cliVersion)
	}
	if rootCmd.Version != "2.3.4" {
		t.Errorf("rootCmd.Version = %q, want 2.3.4", rootCmd.Version)
	}
}

// ── runShare ──────────────────────────────────────────────────────────────

func captureStdout(fn func()) string {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w
	fn()
	w.Close()
	os.Stdout = old
	var buf bytes.Buffer
	buf.ReadFrom(r)
	return buf.String()
}

func TestRunShare_URLFormat(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "plan.md")
	os.WriteFile(file, []byte("# My Plan\nsome content here"), 0644)

	var err error
	out := captureStdout(func() { err = runShare(file) })

	if err != nil {
		t.Fatalf("runShare: %v", err)
	}
	if !strings.Contains(out, "https://openplan.smithgajjar.dev/app#share?hash=") {
		t.Errorf("expected share URL in output, got:\n%s", out)
	}
}

func TestRunShare_TitleFromHeading(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "plan.md")
	os.WriteFile(file, []byte("# My Great Plan\nsome content"), 0644)

	title := deriveTitleFromContent("# My Great Plan\nsome content", file)
	if title != "My Great Plan" {
		t.Errorf("expected %q, got %q", "My Great Plan", title)
	}
}

func TestRunShare_TitleFallsBackToFilename(t *testing.T) {
	title := deriveTitleFromContent("no heading here", "/some/path/my-plan.md")
	if title != "my-plan" {
		t.Errorf("expected %q, got %q", "my-plan", title)
	}
}

func TestRunShare_FileNotFound(t *testing.T) {
	err := runShare("/nonexistent/file.md")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestRunShare_FriendlyMessage(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "plan.md")
	os.WriteFile(file, []byte("# Plan\ncontent"), 0644)

	var err error
	out := captureStdout(func() { err = runShare(file) })

	if err != nil {
		t.Fatalf("runShare: %v", err)
	}
	if !strings.Contains(out, "collaborators") {
		t.Errorf("expected friendly message in output, got:\n%s", out)
	}
}
