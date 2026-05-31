package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/storage"
)

func newTestServeServer(t *testing.T) (*ServeServer, *storage.Storage) {
	t.Helper()
	dir := t.TempDir()
	store := storage.NewWithBase(filepath.Join(dir, "plans"))
	cfg := &config.Config{
		AutoCloseDelay: "3",
		Theme:          "system",
		SaveDestinations: config.SaveDestinations{
			Local: config.SaveDestLocal{Enabled: true, Path: t.TempDir()},
		},
	}
	return NewServeServer(cfg, store, "1.0.0"), store
}

func serveGet(t *testing.T, srv *ServeServer, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	switch {
	case path == "/api/config":
		srv.handleGetConfig(w, req)
	case path == "/api/config/full":
		srv.handleGetConfigFull(w, req)
	case path == "/api/plans":
		srv.handleListPlans(w, req)
	case path == "/api/sessions":
		srv.handleListSessions(w, req)
	case strings.HasPrefix(path, "/api/plan"):
		srv.handleGetPlanDashboard(w, req)
	case strings.HasPrefix(path, "/api/versions"):
		srv.handleGetVersionsDashboard(w, req)
	case strings.HasPrefix(path, "/healthz"):
		handleHealthz(w, req)
	}
	return w
}

func servePost(t *testing.T, srv *ServeServer, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(body)
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	w := httptest.NewRecorder()
	switch {
	case path == "/api/config":
		srv.handleSaveConfig(w, req)
	case path == "/api/save/local":
		srv.handleSaveLocalDashboard(w, req)
	case path == "/api/save/obsidian":
		srv.handleSaveObsidianDashboard(w, req)
	case path == "/api/save/notion":
		srv.handleSaveNotionDashboard(w, req)
	case path == "/api/annotations":
		srv.handleSaveAnnotationsDashboard(w, req)
	}
	return w
}

// ── handleGetConfig ───────────────────────────────────────────────────────

func TestServeGetConfig(t *testing.T) {
	srv, _ := newTestServeServer(t)
	w := serveGet(t, srv, "/api/config")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	if m["mode"] != "serve" {
		t.Errorf("mode = %v, want serve", m["mode"])
	}
	if m["version"] != "1.0.0" {
		t.Errorf("version = %v", m["version"])
	}
}

func TestServeGetConfigFull(t *testing.T) {
	srv, _ := newTestServeServer(t)
	w := serveGet(t, srv, "/api/config/full")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var cfg config.Config
	json.NewDecoder(w.Body).Decode(&cfg)
	if cfg.Theme != "system" {
		t.Errorf("theme = %q", cfg.Theme)
	}
}

// ── handleSaveConfig ──────────────────────────────────────────────────────

func TestServeSaveConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	srv, _ := newTestServeServer(t)
	newCfg := config.Config{Theme: "dark", Port: 9000}
	w := servePost(t, srv, "/api/config", newCfg)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	if srv.cfg.Theme != "dark" {
		t.Errorf("cfg.Theme = %q, want dark", srv.cfg.Theme)
	}
}

// ── handleListPlans ───────────────────────────────────────────────────────

func TestServeListPlans_Empty(t *testing.T) {
	srv, _ := newTestServeServer(t)
	w := serveGet(t, srv, "/api/plans")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	// projects may be null (no dirs yet) or an empty slice
	if raw := m["projects"]; raw != nil {
		projects := raw.([]interface{})
		if len(projects) != 0 {
			t.Errorf("expected 0 projects, got %d", len(projects))
		}
	}
}

func TestServeListPlans_WithData(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj-a", "plan-1", "content")
	store.WriteMeta("proj-a", "plan-1", "approved", 1)

	w := serveGet(t, srv, "/api/plans")
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	projects := m["projects"].([]interface{})
	if len(projects) != 1 {
		t.Errorf("expected 1 project, got %d", len(projects))
	}
}

// ── handleListSessions ────────────────────────────────────────────────────

func TestServeListSessions(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	srv, _ := newTestServeServer(t)
	w := serveGet(t, srv, "/api/sessions")
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	if _, ok := m["sessions"]; !ok {
		t.Error("expected sessions key in response")
	}
}

// ── handleGetPlanDashboard ────────────────────────────────────────────────

func TestServeGetPlanDashboard_MissingParams(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/plan", nil)
	w := httptest.NewRecorder()
	srv.handleGetPlanDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestServeGetPlanDashboard_NotFound(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/plan?project=p&slug=missing", nil)
	w := httptest.NewRecorder()
	srv.handleGetPlanDashboard(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestServeGetPlanDashboard_Success(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "# Plan\ncontent")
	store.WriteMeta("proj", "plan", "approved", 1)

	req := httptest.NewRequest(http.MethodGet, "/api/plan?project=proj&slug=plan", nil)
	w := httptest.NewRecorder()
	srv.handleGetPlanDashboard(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	if m["slug"] != "plan" {
		t.Errorf("slug = %v", m["slug"])
	}
}

// ── handleGetVersionsDashboard ────────────────────────────────────────────

func TestServeGetVersionsDashboard(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "v1")
	store.WriteVersion("proj", "plan", "v2")

	req := httptest.NewRequest(http.MethodGet, "/api/versions?project=proj&slug=plan", nil)
	w := httptest.NewRecorder()
	srv.handleGetVersionsDashboard(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var m map[string]interface{}
	json.NewDecoder(w.Body).Decode(&m)
	versions := m["versions"].([]interface{})
	if len(versions) != 2 {
		t.Errorf("expected 2 versions, got %d", len(versions))
	}
}

// ── handleGetVersionDashboard ─────────────────────────────────────────────

func TestServeGetVersionDashboard_Success(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "content v1")

	req := httptest.NewRequest(http.MethodGet, "/api/version/1?project=proj&slug=plan", nil)
	req.SetPathValue("n", "1")
	w := httptest.NewRecorder()
	srv.handleGetVersionDashboard(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestServeGetVersionDashboard_InvalidN(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version/bad", nil)
	req.SetPathValue("n", "bad")
	w := httptest.NewRecorder()
	srv.handleGetVersionDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestServeGetVersionDashboard_NotFound(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version/99", nil)
	req.SetPathValue("n", "99")
	w := httptest.NewRecorder()
	srv.handleGetVersionDashboard(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ── handleRestoreDashboard ────────────────────────────────────────────────

func TestServeRestoreDashboard_Success(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "v1")
	store.WriteVersion("proj", "plan", "v2")

	req := httptest.NewRequest(http.MethodPost, "/api/restore/1?project=proj&slug=plan", nil)
	req.SetPathValue("n", "1")
	w := httptest.NewRecorder()
	srv.handleRestoreDashboard(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

func TestServeRestoreDashboard_InvalidN(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/restore/bad", nil)
	req.SetPathValue("n", "bad")
	w := httptest.NewRecorder()
	srv.handleRestoreDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleGetAnnotationsDashboard ─────────────────────────────────────────

func TestServeGetAnnotationsDashboard_Empty(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/annotations/1?project=proj&slug=plan", nil)
	req.SetPathValue("version", "1")
	w := httptest.NewRecorder()
	srv.handleGetAnnotationsDashboard(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"annotations":[]`) {
		t.Errorf("expected empty annotations, got %s", w.Body)
	}
}

func TestServeGetAnnotationsDashboard_InvalidVersion(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/annotations/bad", nil)
	req.SetPathValue("version", "bad")
	w := httptest.NewRecorder()
	srv.handleGetAnnotationsDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleSaveAnnotationsDashboard ───────────────────────────────────────

func TestServeSaveAnnotationsDashboard(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "content")

	body := map[string]interface{}{
		"project":     "proj",
		"slug":        "plan",
		"version":     1,
		"annotations": json.RawMessage(`[{"id":"x"}]`),
	}
	w := servePost(t, srv, "/api/annotations", body)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

// ── handleSaveLocalDashboard ──────────────────────────────────────────────

func TestServeSaveLocalDashboard(t *testing.T) {
	dir := t.TempDir()
	srv, store := newTestServeServer(t)
	srv.cfg.SaveDestinations.Local.Enabled = true
	srv.cfg.SaveDestinations.Local.Path = dir
	store.WriteVersion("proj", "plan", "# Plan\ncontent")

	body := map[string]string{"project": "proj", "slug": "plan"}
	w := servePost(t, srv, "/api/save/local", body)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

// ── handleSaveObsidianDashboard ───────────────────────────────────────────

func TestServeSaveObsidianDashboard_NotConfigured(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "content")

	body := map[string]string{"project": "proj", "slug": "plan"}
	w := servePost(t, srv, "/api/save/obsidian", body)
	if w.Code != 500 {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

func TestServeSaveObsidianDashboard_Success(t *testing.T) {
	vault := t.TempDir()
	srv, store := newTestServeServer(t)
	srv.cfg.SaveDestinations.Obsidian.VaultPath = vault
	srv.cfg.SaveDestinations.Obsidian.Folder = "Plans"
	store.WriteVersion("proj", "plan", "# Plan\ncontent")

	body := map[string]string{"project": "proj", "slug": "plan"}
	w := servePost(t, srv, "/api/save/obsidian", body)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

// ── handleSaveNotionDashboard ─────────────────────────────────────────────

func TestServeSaveNotionDashboard_NotConfigured(t *testing.T) {
	srv, store := newTestServeServer(t)
	store.WriteVersion("proj", "plan", "content")

	body := map[string]string{"project": "proj", "slug": "plan"}
	w := servePost(t, srv, "/api/save/notion", body)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── ServeServer Start / Stop ──────────────────────────────────────────────

func TestServeServerStartStop(t *testing.T) {
	srv, _ := newTestServeServer(t)
	port, err := srv.Start(0)
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
	srv.Stop()
}

// ── planParams helper ─────────────────────────────────────────────────────

func TestPlanParams(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/plan?project=myproj&slug=myslug", nil)
	proj, slug := srv.planParams(req)
	if proj != "myproj" || slug != "myslug" {
		t.Errorf("planParams = (%q, %q)", proj, slug)
	}
}

// ── handleSaveConfig error path ───────────────────────────────────────────

func TestServeSaveConfig_InvalidJSON(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/config", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	srv.handleSaveConfig(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleSaveAnnotationsDashboard error path ─────────────────────────────

func TestServeSaveAnnotationsDashboard_InvalidJSON(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/annotations", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	srv.handleSaveAnnotationsDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleSaveLocalDashboard error paths ──────────────────────────────────

func TestServeSaveLocalDashboard_InvalidJSON(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/save/local", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	srv.handleSaveLocalDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestServeSaveLocalDashboard_PlanNotFound(t *testing.T) {
	srv, _ := newTestServeServer(t)
	body := map[string]string{"project": "noproject", "slug": "noplan"}
	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(body)
	req := httptest.NewRequest(http.MethodPost, "/api/save/local", &buf)
	w := httptest.NewRecorder()
	srv.handleSaveLocalDashboard(w, req)
	if w.Code != 500 {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

// ── handleSaveObsidianDashboard error path ────────────────────────────────

func TestServeSaveObsidianDashboard_InvalidJSON(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/save/obsidian", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	srv.handleSaveObsidianDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleSaveNotionDashboard error path ──────────────────────────────────

func TestServeSaveNotionDashboard_InvalidJSON(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/save/notion", strings.NewReader("{bad}"))
	w := httptest.NewRecorder()
	srv.handleSaveNotionDashboard(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── handleGetVersionsDashboard error path ─────────────────────────────────

func TestServeGetVersionsDashboard_Empty(t *testing.T) {
	srv, _ := newTestServeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/versions?project=p&slug=s", nil)
	w := httptest.NewRecorder()
	srv.handleGetVersionsDashboard(w, req)
	// No versions exist — returns empty list, not an error
	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}
}
