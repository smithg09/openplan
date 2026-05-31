package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/storage"
)

// ── helpers ───────────────────────────────────────────────────────────────

func newTestStorage(t *testing.T) *storage.Storage {
	t.Helper()
	dir := t.TempDir()
	// Storage is unexported-field; use exported New then swap baseDir via a
	// local helper that just calls the public constructor pointed at a temp dir.
	// Since Storage.baseDir is unexported we export a helper in the test.
	return storageWithBase(filepath.Join(dir, "plans"))
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	cfg := &config.Config{
		AutoCloseDelay: "3",
		Theme:          "system",
		SaveDestinations: config.SaveDestinations{
			Local: config.SaveDestLocal{Enabled: true, Path: t.TempDir()},
		},
	}
	store := newTestStorage(t)
	evt := &HookEvent{
		HookEventName: "PermissionRequest",
		SessionID:     "test-session",
		ToolName:      "ExitPlanMode",
		CWD:           "/tmp/project",
	}
	evt.ToolInput.Plan = "# Test Plan\nsome content"

	store.WriteVersion("proj", "test-plan", evt.ToolInput.Plan)
	store.WriteMeta("proj", "test-plan", "pending", 1)

	return New(cfg, evt, "proj", "test-plan", 1, store, "1.0.0")
}

func get(t *testing.T, s *Server, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	switch path {
	case "/api/plan":
		s.handleGetPlan(w, req)
	case "/api/config":
		s.handleGetConfig(w, req)
	case "/api/versions":
		s.handleGetVersions(w, req)
	case "/healthz":
		handleHealthz(w, req)
	}
	return w
}

func post(t *testing.T, s *Server, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(body)
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	w := httptest.NewRecorder()
	switch path {
	case "/api/approve":
		s.handleApprove(w, req)
	case "/api/deny":
		s.handleDeny(w, req)
	case "/api/draft":
		s.handleSaveDraft(w, req)
	case "/api/annotations":
		s.handleSaveAnnotations(w, req)
	case "/api/save/local":
		s.handleSaveLocal(w, req)
	}
	return w
}

func decodeJSON(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&m); err != nil {
		t.Fatalf("decoding response: %v (body: %s)", err, w.Body.String())
	}
	return m
}

// ── planTitle ─────────────────────────────────────────────────────────────

func TestPlanTitle_FromHeading(t *testing.T) {
	s := newTestServer(t)
	s.event.ToolInput.Plan = "# My Great Plan\ncontent"
	if got := s.planTitle(); got != "My Great Plan" {
		t.Errorf("planTitle = %q, want %q", got, "My Great Plan")
	}
}

func TestPlanTitle_FromLabel(t *testing.T) {
	s := newTestServer(t)
	s.event.ToolInput.Plan = "no heading here"
	s.planLabel = "/some/path/my_cool-file.md"
	if got := s.planTitle(); got != "My Cool File" {
		t.Errorf("planTitle = %q, want %q", got, "My Cool File")
	}
}

func TestPlanTitle_FromSlug(t *testing.T) {
	s := newTestServer(t)
	s.event.ToolInput.Plan = "no heading"
	s.planLabel = ""
	s.planSlug = "deploy-strategy"
	if got := s.planTitle(); got != "Deploy Strategy" {
		t.Errorf("planTitle = %q, want %q", got, "Deploy Strategy")
	}
}

// ── handleGetPlan ─────────────────────────────────────────────────────────

func TestHandleGetPlan(t *testing.T) {
	s := newTestServer(t)
	w := get(t, s, "/api/plan")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	m := decodeJSON(t, w)
	if m["slug"] != "test-plan" {
		t.Errorf("slug = %v", m["slug"])
	}
	if m["version"].(float64) != 1 {
		t.Errorf("version = %v", m["version"])
	}
}

// ── handleGetConfig ───────────────────────────────────────────────────────

func TestHandleGetConfig_HookMode(t *testing.T) {
	s := newTestServer(t)
	w := get(t, s, "/api/config")
	m := decodeJSON(t, w)
	if m["mode"] != "hook" {
		t.Errorf("mode = %v, want hook", m["mode"])
	}
	if m["version"] != "1.0.0" {
		t.Errorf("version = %v, want 1.0.0", m["version"])
	}
}

func TestHandleGetConfig_DirectoryMode(t *testing.T) {
	s := newTestServer(t)
	s.dirRoot = "/tmp/docs"
	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	w := httptest.NewRecorder()
	s.handleGetConfig(w, req)
	m := decodeJSON(t, w)
	if m["mode"] != "annotate-dir" {
		t.Errorf("mode = %v, want annotate-dir", m["mode"])
	}
}

// ── handleApprove / handleDeny ────────────────────────────────────────────

func TestHandleApprove(t *testing.T) {
	s := newTestServer(t)
	// Drain the decision channel in background
	go func() { <-s.decision }()

	w := post(t, s, "/api/approve", map[string]string{})
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	m := decodeJSON(t, w)
	if m["ok"] != true {
		t.Errorf("ok = %v", m["ok"])
	}
}

func TestHandleApprove_WithEditedContent(t *testing.T) {
	s := newTestServer(t)
	go func() { <-s.decision }()

	w := post(t, s, "/api/approve", map[string]string{"editedContent": "# Updated\ncontent"})
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

func TestHandleApprove_AutoMode(t *testing.T) {
	s := newTestServer(t)
	go func() { <-s.decision }()

	w := post(t, s, "/api/approve", map[string]string{"mode": "auto"})
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandleDeny(t *testing.T) {
	s := newTestServer(t)
	go func() { <-s.decision }()

	w := post(t, s, "/api/deny", map[string]string{"message": "not good"})
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	m := decodeJSON(t, w)
	if m["ok"] != true {
		t.Errorf("ok = %v", m["ok"])
	}
}

func TestHandleDeny_WithEditedContent(t *testing.T) {
	s := newTestServer(t)
	go func() { <-s.decision }()

	w := post(t, s, "/api/deny", map[string]string{"editedContent": "# Edited\ncontent", "message": "needs work"})
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
}

// ── handleGetVersions / handleGetVersion ──────────────────────────────────

func TestHandleGetVersions(t *testing.T) {
	s := newTestServer(t)
	w := get(t, s, "/api/versions")
	m := decodeJSON(t, w)
	versions := m["versions"].([]interface{})
	if len(versions) != 1 {
		t.Errorf("expected 1 version, got %d", len(versions))
	}
}

func TestHandleGetVersion_Valid(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version/1", nil)
	req.SetPathValue("n", "1")
	w := httptest.NewRecorder()
	s.handleGetVersion(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	m := decodeJSON(t, w)
	if m["version"].(float64) != 1 {
		t.Errorf("version = %v", m["version"])
	}
}

func TestHandleGetVersion_InvalidN(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version/abc", nil)
	req.SetPathValue("n", "abc")
	w := httptest.NewRecorder()
	s.handleGetVersion(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleGetVersion_NotFound(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version/99", nil)
	req.SetPathValue("n", "99")
	w := httptest.NewRecorder()
	s.handleGetVersion(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ── handleRestoreVersion ─────────────────────────────────────────────────

func TestHandleRestoreVersion(t *testing.T) {
	s := newTestServer(t)
	s.store.WriteVersion("proj", "test-plan", "v2 content")

	req := httptest.NewRequest(http.MethodPost, "/api/restore/1", nil)
	req.SetPathValue("n", "1")
	w := httptest.NewRecorder()
	s.handleRestoreVersion(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	m := decodeJSON(t, w)
	if m["ok"] != true {
		t.Errorf("ok = %v", m["ok"])
	}
}

func TestHandleRestoreVersion_InvalidN(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/restore/x", nil)
	req.SetPathValue("n", "x")
	w := httptest.NewRecorder()
	s.handleRestoreVersion(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleGetAnnotations / handleSaveAnnotations ──────────────────────────

func TestHandleGetAnnotations_Empty(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/annotations/1", nil)
	req.SetPathValue("version", "1")
	w := httptest.NewRecorder()
	s.handleGetAnnotations(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, `"annotations":[]`) {
		t.Errorf("expected empty annotations, got %s", body)
	}
}

func TestHandleGetAnnotations_InvalidVersion(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/annotations/bad", nil)
	req.SetPathValue("version", "bad")
	w := httptest.NewRecorder()
	s.handleGetAnnotations(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleSaveAndGetAnnotations(t *testing.T) {
	s := newTestServer(t)

	// Save
	body := map[string]interface{}{
		"version":     1,
		"annotations": json.RawMessage(`[{"id":"a1","text":"note"}]`),
	}
	w := post(t, s, "/api/annotations", body)
	if w.Code != 200 {
		t.Fatalf("save status = %d, body = %s", w.Code, w.Body)
	}

	// Get
	req := httptest.NewRequest(http.MethodGet, "/api/annotations/1", nil)
	req.SetPathValue("version", "1")
	w2 := httptest.NewRecorder()
	s.handleGetAnnotations(w2, req)
	if w2.Code != 200 {
		t.Fatalf("get status = %d", w2.Code)
	}
	respBody := w2.Body.String()
	if !strings.Contains(respBody, "a1") {
		t.Errorf("expected annotation id, got %s", respBody)
	}
}

// ── handleSaveDraft ───────────────────────────────────────────────────────

func TestHandleSaveDraft(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)

	s := newTestServer(t)
	w := post(t, s, "/api/draft", map[string]interface{}{"content": "draft text"})
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

// ── handleSaveLocal ───────────────────────────────────────────────────────

func TestHandleSaveLocal(t *testing.T) {
	dir := t.TempDir()
	s := newTestServer(t)
	s.cfg.SaveDestinations.Local.Path = dir

	w := post(t, s, "/api/save/local", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) == 0 {
		t.Error("expected file to be saved")
	}
}

// ── handleSaveObsidian ────────────────────────────────────────────────────

func TestHandleSaveObsidian_NotConfigured(t *testing.T) {
	s := newTestServer(t)
	s.cfg.SaveDestinations.Obsidian.VaultPath = ""

	req := httptest.NewRequest(http.MethodPost, "/api/save/obsidian", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.handleSaveObsidian(w, req)
	if w.Code != 500 {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

func TestHandleSaveObsidian_Success(t *testing.T) {
	vault := t.TempDir()
	s := newTestServer(t)
	s.cfg.SaveDestinations.Obsidian.VaultPath = vault
	s.cfg.SaveDestinations.Obsidian.Folder = "Plans"

	req := httptest.NewRequest(http.MethodPost, "/api/save/obsidian", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.handleSaveObsidian(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

// ── handleSaveNotion ──────────────────────────────────────────────────────

func TestHandleSaveNotion_NotConfigured(t *testing.T) {
	s := newTestServer(t)
	s.cfg.SaveDestinations.Notion.Token = ""

	req := httptest.NewRequest(http.MethodPost, "/api/save/notion", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.handleSaveNotion(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleGetFiles / handleGetFile ────────────────────────────────────────

func TestHandleGetFiles_NotDirectoryMode(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	w := httptest.NewRecorder()
	s.handleGetFiles(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestHandleGetFiles_DirectoryMode(t *testing.T) {
	s := newTestServer(t)
	s.dirRoot = "/tmp/docs"
	s.dirFiles = []string{"a.md", "b.md"}

	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	w := httptest.NewRecorder()
	s.handleGetFiles(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	m := decodeJSON(t, w)
	files := m["files"].([]interface{})
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
}

func TestHandleGetFile_NotDirectoryMode(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/file?path=a.md", nil)
	w := httptest.NewRecorder()
	s.handleGetFile(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestHandleGetFile_MissingPath(t *testing.T) {
	s := newTestServer(t)
	s.dirRoot = t.TempDir()
	req := httptest.NewRequest(http.MethodGet, "/api/file", nil)
	w := httptest.NewRecorder()
	s.handleGetFile(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleGetFile_PathTraversal(t *testing.T) {
	dir := t.TempDir()
	s := newTestServer(t)
	s.dirRoot = dir

	req := httptest.NewRequest(http.MethodGet, "/api/file?path=../../etc/passwd", nil)
	w := httptest.NewRecorder()
	s.handleGetFile(w, req)
	if w.Code != 403 {
		t.Errorf("status = %d, want 403", w.Code)
	}
}

func TestHandleGetFile_Success(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "plan.md"), []byte("# My Plan\ncontent"), 0644)

	s := newTestServer(t)
	s.dirRoot = dir
	s.dirFiles = []string{"plan.md"}

	req := httptest.NewRequest(http.MethodGet, "/api/file?path=plan.md", nil)
	w := httptest.NewRecorder()
	s.handleGetFile(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	m := decodeJSON(t, w)
	if m["path"] != "plan.md" {
		t.Errorf("path = %v", m["path"])
	}
}

func TestHandleGetFile_NotFound(t *testing.T) {
	dir := t.TempDir()
	s := newTestServer(t)
	s.dirRoot = dir

	req := httptest.NewRequest(http.MethodGet, "/api/file?path=missing.md", nil)
	w := httptest.NewRecorder()
	s.handleGetFile(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ── handleHealthz ─────────────────────────────────────────────────────────

func TestHandleHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	handleHealthz(w, req)
	if w.Code != 200 {
		t.Errorf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Errorf("unexpected body: %s", w.Body)
	}
}

// ── buildApproveDecision / buildDenyDecision ──────────────────────────────

func TestBuildApproveDecision_Default(t *testing.T) {
	d := buildApproveDecision("")
	var m map[string]interface{}
	json.Unmarshal([]byte(d), &m)
	out := m["hookSpecificOutput"].(map[string]interface{})
	dec := out["decision"].(map[string]interface{})
	if dec["behavior"] != "allow" {
		t.Errorf("behavior = %v", dec["behavior"])
	}
	if _, ok := dec["permissionMode"]; ok {
		t.Error("permissionMode should not be set for default mode")
	}
}

func TestBuildApproveDecision_Auto(t *testing.T) {
	d := buildApproveDecision("auto")
	var m map[string]interface{}
	json.Unmarshal([]byte(d), &m)
	out := m["hookSpecificOutput"].(map[string]interface{})
	dec := out["decision"].(map[string]interface{})
	if dec["permissionMode"] != "bypassPermissions" {
		t.Errorf("permissionMode = %v", dec["permissionMode"])
	}
}

func TestBuildApproveDecision_PlanOnly(t *testing.T) {
	d := buildApproveDecision("plan-only")
	var m map[string]interface{}
	json.Unmarshal([]byte(d), &m)
	out := m["hookSpecificOutput"].(map[string]interface{})
	dec := out["decision"].(map[string]interface{})
	if dec["permissionMode"] != "planOnly" {
		t.Errorf("permissionMode = %v", dec["permissionMode"])
	}
}

func TestBuildDenyDecision(t *testing.T) {
	d := buildDenyDecision("needs work")
	var m map[string]interface{}
	json.Unmarshal([]byte(d), &m)
	out := m["hookSpecificOutput"].(map[string]interface{})
	dec := out["decision"].(map[string]interface{})
	if dec["behavior"] != "deny" {
		t.Errorf("behavior = %v", dec["behavior"])
	}
	if dec["message"] != "needs work" {
		t.Errorf("message = %v", dec["message"])
	}
}

// ── expandPath ────────────────────────────────────────────────────────────

func TestExpandPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	got := expandPath("~/docs/plan.md")
	want := filepath.Join(home, "docs/plan.md")
	if got != want {
		t.Errorf("expandPath = %q, want %q", got, want)
	}

	abs := "/absolute/path"
	if got := expandPath(abs); got != abs {
		t.Errorf("expandPath(%q) = %q, want unchanged", abs, got)
	}
}

// ── saveToObsidian ────────────────────────────────────────────────────────

func TestSaveToObsidian(t *testing.T) {
	vault := t.TempDir()
	cfg := &config.Config{
		SaveDestinations: config.SaveDestinations{
			Obsidian: config.SaveDestObsidian{
				VaultPath: vault,
				Folder:    "Plans",
			},
		},
	}
	path, err := saveToObsidian(cfg, "my-plan", "My Plan", "# My Plan\ncontent")
	if err != nil {
		t.Fatalf("saveToObsidian: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading saved file: %v", err)
	}
	if !strings.Contains(string(data), "# My Plan") {
		t.Errorf("file missing plan content: %s", data)
	}
	if !strings.Contains(string(data), "title: My Plan") {
		t.Errorf("file missing frontmatter: %s", data)
	}
}

func TestSaveToObsidian_NoVault(t *testing.T) {
	cfg := &config.Config{}
	_, err := saveToObsidian(cfg, "slug", "Title", "content")
	if err == nil {
		t.Error("expected error when vaultPath is empty")
	}
}

// ── WithLabel / WithDirectory ─────────────────────────────────────────────

func TestWithLabel(t *testing.T) {
	s := newTestServer(t)
	s.WithLabel("my-file.md")
	if s.planLabel != "my-file.md" {
		t.Errorf("planLabel = %q", s.planLabel)
	}
}

func TestWithDirectory(t *testing.T) {
	s := newTestServer(t)
	s.WithDirectory("/docs", []string{"a.md", "b.md"})
	if s.dirRoot != "/docs" {
		t.Errorf("dirRoot = %q", s.dirRoot)
	}
	if len(s.dirFiles) != 2 {
		t.Errorf("dirFiles len = %d", len(s.dirFiles))
	}
}

// ── Server Start / Stop ───────────────────────────────────────────────────

func TestServerStartStop(t *testing.T) {
	s := newTestServer(t)
	port, err := s.Start()
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if port == 0 {
		t.Error("expected non-zero port")
	}

	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/healthz", port))
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("healthz status = %d", resp.StatusCode)
	}

	s.Stop()
}

// ── sendDecision (idempotent) ─────────────────────────────────────────────

func TestSendDecision_Idempotent(t *testing.T) {
	s := newTestServer(t)
	s.sendDecision("first")
	s.sendDecision("second") // should not block
	got := <-s.decision
	if got != "first" {
		t.Errorf("got %q, want first", got)
	}
}

// ── spaHandler ────────────────────────────────────────────────────────────

func TestSPAHandler_FallsBackToIndex(t *testing.T) {
	s := newTestServer(t)
	port, err := s.Start()
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	// A path that doesn't match any static asset should return index.html (200)
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/some/client/route", port))
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("SPA fallback status = %d, want 200", resp.StatusCode)
	}
}

// ── saveToNotion (no token / no parentPage) ────────────────────────────────

func TestSaveToNotion_NoToken(t *testing.T) {
	cfg := &config.Config{}
	_, _, err := saveToNotion(cfg, "Title", "content")
	if err != errNotionNotConfigured {
		t.Errorf("err = %v, want errNotionNotConfigured", err)
	}
}

func TestSaveToNotion_NoParentPage(t *testing.T) {
	cfg := &config.Config{
		SaveDestinations: config.SaveDestinations{
			Notion: config.SaveDestNotion{Token: "tok", ParentPageID: ""},
		},
	}
	_, _, err := saveToNotion(cfg, "Title", "content")
	if err == nil {
		t.Error("expected error when parentPageId is empty")
	}
}

// ── WaitForDecision ───────────────────────────────────────────────────────

func TestWaitForDecision(t *testing.T) {
	s := newTestServer(t)
	go func() { s.decision <- "the-decision\n" }()

	// WaitForDecision sleeps 1.5s internally; run in a goroutine with timeout
	done := make(chan string, 1)
	go func() { done <- s.WaitForDecision() }()

	select {
	case got := <-done:
		if got != "the-decision\n" {
			t.Errorf("WaitForDecision = %q", got)
		}
	case <-func() chan struct{} {
		ch := make(chan struct{})
		go func() {
			// 3 second max for the 1.5s sleep
			time.Sleep(3 * time.Second)
			close(ch)
		}()
		return ch
	}():
		t.Error("WaitForDecision timed out")
	}
}

// ── handleSaveAnnotations error path ─────────────────────────────────────

func TestHandleSaveAnnotations_InvalidJSON(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/annotations", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	s.handleSaveAnnotations(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleSaveDraft error path ────────────────────────────────────────────

func TestHandleSaveDraft_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)

	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/draft", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	s.handleSaveDraft(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleApprove / handleDeny error paths ────────────────────────────────

func TestHandleSaveLocal_PlanNotFound(t *testing.T) {
	s := newTestServer(t)
	s.planSlug = "nonexistent-plan"
	s.version = 99

	req := httptest.NewRequest(http.MethodPost, "/api/save/local", nil)
	w := httptest.NewRecorder()
	s.handleSaveLocal(w, req)
	if w.Code != 500 {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

// ── getAnnotationCount ────────────────────────────────────────────────────

func TestGetAnnotationCount_WithAnnotations(t *testing.T) {
	dir := t.TempDir()
	// Write a markdown file
	os.WriteFile(filepath.Join(dir, "plan.md"), []byte("# My Plan\ncontent"), 0644)

	s := newTestServer(t)
	s.dirRoot = dir
	s.dirFiles = []string{"plan.md"}

	// Store annotations for this plan in the store
	s.store.WriteVersion("proj", "my-plan", "# My Plan\ncontent")
	payload := []byte(`{"version":1,"annotations":[{"id":"a1"},{"id":"a2"}]}`)
	s.store.WriteAnnotations("proj", "my-plan", 1, payload)

	count := s.getAnnotationCount("plan.md")
	if count != 2 {
		t.Errorf("getAnnotationCount = %d, want 2", count)
	}
}

func TestGetAnnotationCount_NoAnnotations(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "empty.md"), []byte("# Empty\n"), 0644)

	s := newTestServer(t)
	s.dirRoot = dir

	count := s.getAnnotationCount("empty.md")
	if count != 0 {
		t.Errorf("expected 0, got %d", count)
	}
}

func TestGetAnnotationCount_UnreadableFile(t *testing.T) {
	s := newTestServer(t)
	s.dirRoot = t.TempDir()
	count := s.getAnnotationCount("does-not-exist.md")
	if count != 0 {
		t.Errorf("expected 0 for missing file, got %d", count)
	}
}

// ── handleGetVersions error path ──────────────────────────────────────────

func TestHandleGetVersions_Empty(t *testing.T) {
	s := newTestServer(t)
	s.planSlug = "new-plan" // no versions written
	w := get(t, s, "/api/versions")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
}

// ── handleSaveNotion with mock server ─────────────────────────────────────

func TestHandleSaveNotion_MockServer(t *testing.T) {
	// Mock Notion API server
	notionSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"page-123","url":"https://notion.so/page-123"}`)
	}))
	defer notionSrv.Close()

	// We can't override the Notion URL easily, so test the 400 path (not configured)
	s := newTestServer(t)
	s.cfg.SaveDestinations.Notion.Token = ""
	req := httptest.NewRequest(http.MethodPost, "/api/save/notion", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.handleSaveNotion(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── spaHandler serves static file ─────────────────────────────────────────

func TestSPAHandler_ServesStaticFile(t *testing.T) {
	s := newTestServer(t)
	port, err := s.Start()
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	// index.html exists in the embedded dist
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/index.html", port))
	if err != nil {
		t.Fatalf("GET /index.html: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("index.html status = %d, want 200", resp.StatusCode)
	}
}
