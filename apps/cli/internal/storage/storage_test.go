package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Slug helpers ──────────────────────────────────────────────────────────

func TestDeriveProjectSlug(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"/home/user/my-project", "home-user-my-project"},
		{"/Users/smith/Projects/openplan", "Users-smith-Projects-openplan"},
		{"", "unknown"},
		{"///", "unknown"},
	}
	for _, c := range cases {
		got := DeriveProjectSlug(c.in)
		if got != c.want {
			t.Errorf("DeriveProjectSlug(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestDerivePlanSlug(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    string
	}{
		{"h1 heading", "# My Great Plan\nsome content", "my-great-plan"},
		{"h2 heading", "## Deploy Strategy\nmore content", "deploy-strategy"},
		{"no heading", "just plain text\nno headers", ""},      // returns plan-<timestamp>
		{"empty", "", ""},
		{"heading with special chars", "# Hello, World! 2024", "hello-world-2024"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := DerivePlanSlug(c.content)
			if c.want == "" {
				// Should return a timestamp-based slug
				if !strings.HasPrefix(got, "plan-") {
					t.Errorf("expected timestamp slug, got %q", got)
				}
			} else if got != c.want {
				t.Errorf("DerivePlanSlug(%q) = %q, want %q", c.content, got, c.want)
			}
		})
	}
}

func TestSlugToTitle(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"my-plan", "My Plan"},
		{"deploy-strategy-v2", "Deploy Strategy V2"},
		{"single", "Single"},
		{"", ""},
	}
	for _, c := range cases {
		got := SlugToTitle(c.in)
		if got != c.want {
			t.Errorf("SlugToTitle(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// ── Storage CRUD ──────────────────────────────────────────────────────────

func newTestStorage(t *testing.T) *Storage {
	t.Helper()
	dir := t.TempDir()
	return &Storage{baseDir: filepath.Join(dir, "plans")}
}

func TestWriteAndReadVersion(t *testing.T) {
	s := newTestStorage(t)
	content := "# Test Plan\nsome content"

	v, err := s.WriteVersion("proj", "test-plan", content)
	if err != nil {
		t.Fatalf("WriteVersion: %v", err)
	}
	if v != 1 {
		t.Errorf("expected version 1, got %d", v)
	}

	got, err := s.ReadVersion("proj", "test-plan", 1)
	if err != nil {
		t.Fatalf("ReadVersion: %v", err)
	}
	if got != content {
		t.Errorf("ReadVersion = %q, want %q", got, content)
	}
}

func TestWriteVersionIncrementsVersion(t *testing.T) {
	s := newTestStorage(t)
	for i := 1; i <= 3; i++ {
		v, err := s.WriteVersion("proj", "plan", "content")
		if err != nil {
			t.Fatalf("WriteVersion %d: %v", i, err)
		}
		if v != i {
			t.Errorf("iteration %d: expected version %d, got %d", i, i, v)
		}
	}
}

func TestCurrentVersion(t *testing.T) {
	s := newTestStorage(t)

	if v := s.CurrentVersion("proj", "plan"); v != 0 {
		t.Errorf("empty plan: expected version 0, got %d", v)
	}

	s.WriteVersion("proj", "plan", "v1")
	if v := s.CurrentVersion("proj", "plan"); v != 1 {
		t.Errorf("after one write: expected 1, got %d", v)
	}

	s.WriteVersion("proj", "plan", "v2")
	if v := s.CurrentVersion("proj", "plan"); v != 2 {
		t.Errorf("after two writes: expected 2, got %d", v)
	}
}

func TestListVersions(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "plan", "v1 content")
	s.WriteVersion("proj", "plan", "v2 content")

	versions, err := s.ListVersions("proj", "plan")
	if err != nil {
		t.Fatalf("ListVersions: %v", err)
	}
	if len(versions) != 2 {
		t.Errorf("expected 2 versions, got %d", len(versions))
	}
	if versions[0]["number"] != 1 || versions[1]["number"] != 2 {
		t.Errorf("unexpected version numbers: %v", versions)
	}
}

func TestWriteAndReadMeta(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "my-plan", "content")

	if err := s.WriteMeta("proj", "my-plan", "pending", 1); err != nil {
		t.Fatalf("WriteMeta: %v", err)
	}

	meta, err := s.ReadMeta("proj", "my-plan")
	if err != nil {
		t.Fatalf("ReadMeta: %v", err)
	}
	if meta.Slug != "my-plan" {
		t.Errorf("Slug = %q, want %q", meta.Slug, "my-plan")
	}
	if meta.Status != "pending" {
		t.Errorf("Status = %q, want %q", meta.Status, "pending")
	}
	if meta.CurrentVersion != 1 {
		t.Errorf("CurrentVersion = %d, want 1", meta.CurrentVersion)
	}
}

func TestWriteMetaPreservesCreatedAt(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "plan", "content")
	s.WriteMeta("proj", "plan", "pending", 1)

	m1, _ := s.ReadMeta("proj", "plan")
	s.WriteMeta("proj", "plan", "approved", 2)
	m2, _ := s.ReadMeta("proj", "plan")

	if m1.CreatedAt != m2.CreatedAt {
		t.Errorf("CreatedAt changed: %q → %q", m1.CreatedAt, m2.CreatedAt)
	}
}

func TestWriteAndReadAnnotations(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "plan", "content")

	payload := json.RawMessage(`[{"id":"1","text":"note"}]`)
	if err := s.WriteAnnotations("proj", "plan", 1, payload); err != nil {
		t.Fatalf("WriteAnnotations: %v", err)
	}

	got, err := s.ReadAnnotations("proj", "plan", 1)
	if err != nil {
		t.Fatalf("ReadAnnotations: %v", err)
	}
	if string(got) != string(payload) {
		t.Errorf("ReadAnnotations = %s, want %s", got, payload)
	}
}

func TestRestoreVersion(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "plan", "original content")
	s.WriteVersion("proj", "plan", "modified content")

	newV, err := s.RestoreVersion("proj", "plan", 1)
	if err != nil {
		t.Fatalf("RestoreVersion: %v", err)
	}
	if newV != 3 {
		t.Errorf("expected restored version 3, got %d", newV)
	}

	content, _ := s.ReadVersion("proj", "plan", newV)
	if content != "original content" {
		t.Errorf("restored content = %q, want %q", content, "original content")
	}
}

func TestListProjects(t *testing.T) {
	s := newTestStorage(t)

	projects, err := s.ListProjects()
	if err != nil || len(projects) != 0 {
		t.Errorf("empty storage: expected no projects, got %v %v", projects, err)
	}

	s.WriteVersion("proj-a", "plan", "content")
	s.WriteVersion("proj-b", "plan", "content")

	projects, err = s.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 2 {
		t.Errorf("expected 2 projects, got %d: %v", len(projects), projects)
	}
}

func TestListPlans(t *testing.T) {
	s := newTestStorage(t)
	s.WriteVersion("proj", "plan-a", "content")
	s.WriteMeta("proj", "plan-a", "approved", 1)
	s.WriteVersion("proj", "plan-b", "content")
	s.WriteMeta("proj", "plan-b", "pending", 1)

	plans, err := s.ListPlans("proj")
	if err != nil {
		t.Fatalf("ListPlans: %v", err)
	}
	if len(plans) != 2 {
		t.Errorf("expected 2 plans, got %d", len(plans))
	}
}

func TestSaveToLocalPath(t *testing.T) {
	dir := t.TempDir()
	err := SaveToLocalPath("# My Plan\ncontent", "my-plan", dir)
	if err != nil {
		t.Fatalf("SaveToLocalPath: %v", err)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}
	if !strings.HasSuffix(entries[0].Name(), "-my-plan.md") {
		t.Errorf("unexpected filename: %s", entries[0].Name())
	}
}

func TestSaveToLocalPath_TildeExpansion(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	err := SaveToLocalPath("# Plan\ncontent", "tilde-plan", "~/exports")
	if err != nil {
		t.Fatalf("SaveToLocalPath with ~/: %v", err)
	}
	entries, _ := os.ReadDir(filepath.Join(home, "exports"))
	if len(entries) != 1 {
		t.Errorf("expected 1 file, got %d", len(entries))
	}
}

// ── New ────────────────────────────────────────────────────────────────────

func TestNew_UsesHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	s := New()
	if s == nil {
		t.Fatal("New() returned nil")
	}
}

// ── Sessions ──────────────────────────────────────────────────────────────

func TestWriteReadRemoveSession(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	sess := &Session{
		PID:       os.Getpid(),
		Port:      7432,
		URL:       "http://localhost:7432",
		Mode:      "hook",
		Project:   "test-project",
		StartedAt: "2024-01-01T00:00:00Z",
		Label:     "test",
	}

	if err := WriteSession(sess); err != nil {
		t.Fatalf("WriteSession: %v", err)
	}

	sessions, err := ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	found := false
	for _, s := range sessions {
		if s.PID == sess.PID {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find written session in ListSessions")
	}

	if err := RemoveSession(sess.PID); err != nil {
		t.Fatalf("RemoveSession: %v", err)
	}

	sessions2, _ := ListSessions()
	for _, s := range sessions2 {
		if s.PID == sess.PID {
			t.Error("session should have been removed")
		}
	}
}

func TestListSessions_NoDir(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	sessions, err := ListSessions()
	if err != nil {
		t.Fatalf("ListSessions on empty dir: %v", err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestListSessions_SkipsDeadProcesses(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	// Write a session for a PID that can't be alive (max int)
	sessDir := filepath.Join(home, ".openplan", "sessions")
	os.MkdirAll(sessDir, 0755)

	dead := &Session{PID: 999999999, Port: 1234, Mode: "hook"}
	data, _ := json.Marshal(dead)
	os.WriteFile(filepath.Join(sessDir, "999999999.json"), data, 0644)

	sessions, err := ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	for _, s := range sessions {
		if s.PID == 999999999 {
			t.Error("dead process session should have been removed")
		}
	}
}

// ── WriteDraft / ReadDraft ─────────────────────────────────────────────────

func TestWriteAndReadDraft(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	s := New()
	payload := json.RawMessage(`{"content":"draft content"}`)
	if err := s.WriteDraft("my-plan", payload); err != nil {
		t.Fatalf("WriteDraft: %v", err)
	}

	got, err := s.ReadDraft("my-plan")
	if err != nil {
		t.Fatalf("ReadDraft: %v", err)
	}
	if string(got) != string(payload) {
		t.Errorf("ReadDraft = %s, want %s", got, payload)
	}
}

func TestReadDraft_NotFound(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	s := New()
	_, err := s.ReadDraft("nonexistent")
	if err == nil {
		t.Error("expected error reading nonexistent draft")
	}
}

// ── NewWithBase ────────────────────────────────────────────────────────────

func TestNewWithBase(t *testing.T) {
	dir := t.TempDir()
	s := NewWithBase(dir)
	if s == nil {
		t.Fatal("NewWithBase returned nil")
	}
	// Verify it uses the base dir
	s.WriteVersion("p", "plan", "content")
	if _, err := os.Stat(filepath.Join(dir, "p", "plan", "v1.md")); err != nil {
		t.Errorf("expected version file under custom base: %v", err)
	}
}

// ── ListSessions skip non-json ─────────────────────────────────────────────

func TestListSessions_SkipsNonJSON(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	sessDir := filepath.Join(home, ".openplan", "sessions")
	os.MkdirAll(sessDir, 0755)

	// Write a non-json file and a subdir — both should be skipped
	os.WriteFile(filepath.Join(sessDir, "notjson.txt"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(sessDir, "notanumber.json"), []byte("{}"), 0644)

	sessions, err := ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

// ── ListPlans with missing meta ────────────────────────────────────────────

func TestListPlans_SkipsPlansWithNoMeta(t *testing.T) {
	s := newTestStorage(t)
	// Write version but no meta — ListPlans should skip it silently
	s.WriteVersion("proj", "no-meta-plan", "content")

	plans, err := s.ListPlans("proj")
	if err != nil {
		t.Fatalf("ListPlans: %v", err)
	}
	if len(plans) != 0 {
		t.Errorf("expected 0 plans (no meta), got %d", len(plans))
	}
}

// ── ReadVersion error path ─────────────────────────────────────────────────

func TestReadVersion_NotFound(t *testing.T) {
	s := newTestStorage(t)
	_, err := s.ReadVersion("proj", "plan", 99)
	if err == nil {
		t.Error("expected error for missing version")
	}
}
