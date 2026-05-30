package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/storage"
)

// ServeServer is a persistent dashboard server (openplan serve / openplan archive).
type ServeServer struct {
	cfg        *config.Config
	store      *storage.Storage
	binVersion string
	httpSrv    *http.Server
}

func NewServeServer(cfg *config.Config, store *storage.Storage, binVersion string) *ServeServer {
	return &ServeServer{cfg: cfg, store: store, binVersion: binVersion}
}

func (s *ServeServer) Start(port int) (int, error) {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return 0, fmt.Errorf("binding port %d: %w", port, err)
	}

	mux := http.NewServeMux()

	// Dashboard API
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("GET /api/config/full", s.handleGetConfigFull)
	mux.HandleFunc("POST /api/config", s.handleSaveConfig)
	mux.HandleFunc("GET /api/plans", s.handleListPlans)
	mux.HandleFunc("GET /api/sessions", s.handleListSessions)
	mux.HandleFunc("GET /api/plan", s.handleGetPlanDashboard)
	mux.HandleFunc("GET /api/versions", s.handleGetVersionsDashboard)
	mux.HandleFunc("GET /api/version/{n}", s.handleGetVersionDashboard)
	mux.HandleFunc("POST /api/restore/{n}", s.handleRestoreDashboard)
	mux.HandleFunc("GET /api/annotations/{version}", s.handleGetAnnotationsDashboard)
	mux.HandleFunc("POST /api/annotations", s.handleSaveAnnotationsDashboard)
	mux.HandleFunc("POST /api/save/local", s.handleSaveLocalDashboard)
	mux.HandleFunc("POST /api/save/obsidian", s.handleSaveObsidianDashboard)
	mux.HandleFunc("POST /api/save/notion", s.handleSaveNotionDashboard)

	// Share relay
	mux.HandleFunc("POST /api/relay/store", HandleRelayStore)
	mux.HandleFunc("GET /api/relay/fetch/{token}", HandleRelayFetch)

	// Health check
	mux.HandleFunc("GET /healthz", handleHealthz)

	uiFS, err := fs.Sub(uiAssets, "ui/dist")
	if err != nil {
		return 0, fmt.Errorf("preparing UI assets: %w", err)
	}
	mux.Handle("/", spaHandler(http.FileServer(http.FS(uiFS)), uiFS))

	s.httpSrv = &http.Server{Handler: mux}
	go func() {
		_ = s.httpSrv.Serve(listener)
	}()

	return listener.Addr().(*net.TCPAddr).Port, nil
}

func (s *ServeServer) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.httpSrv.Shutdown(ctx)
}

func (s *ServeServer) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"autoCloseDelay": s.cfg.AutoCloseDelay,
		"theme":          s.cfg.Theme,
		"mode":           "serve",
		"version":        s.binVersion,
	})
}

func (s *ServeServer) handleGetConfigFull(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.cfg)
}

func (s *ServeServer) handleSaveConfig(w http.ResponseWriter, r *http.Request) {
	var cfg config.Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if err := config.Write(&cfg); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	s.cfg = &cfg
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

func (s *ServeServer) handleListPlans(w http.ResponseWriter, r *http.Request) {
	projects, err := s.store.ListProjects()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	type projectGroup struct {
		ProjectSlug string          `json:"projectSlug"`
		Plans       []*storage.Meta `json:"plans"`
	}
	var groups []projectGroup
	for _, proj := range projects {
		plans, _ := s.store.ListPlans(proj)
		if plans == nil {
			plans = []*storage.Meta{}
		}
		groups = append(groups, projectGroup{ProjectSlug: proj, Plans: plans})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": groups})
}

func (s *ServeServer) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := storage.ListSessions()
	if err != nil {
		sessions = nil
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"sessions": sessions})
}

// Parameterized dashboard plan endpoints (pass ?project=X&slug=Y)
func (s *ServeServer) planParams(r *http.Request) (string, string) {
	return r.URL.Query().Get("project"), r.URL.Query().Get("slug")
}

func (s *ServeServer) handleGetPlanDashboard(w http.ResponseWriter, r *http.Request) {
	project, slug := s.planParams(r)
	if project == "" || slug == "" {
		http.Error(w, "missing project or slug", 400)
		return
	}
	version := s.store.CurrentVersion(project, slug)
	content, err := s.store.ReadVersion(project, slug, version)
	if err != nil {
		http.Error(w, "plan not found", 404)
		return
	}
	meta, _ := s.store.ReadMeta(project, slug)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"plan":        content,
		"slug":        slug,
		"projectSlug": project,
		"version":     version,
		"meta":        meta,
	})
}

func (s *ServeServer) handleGetVersionsDashboard(w http.ResponseWriter, r *http.Request) {
	project, slug := s.planParams(r)
	versions, err := s.store.ListVersions(project, slug)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	currentVersion := s.store.CurrentVersion(project, slug)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"versions":       versions,
		"currentVersion": currentVersion,
	})
}

func (s *ServeServer) handleGetVersionDashboard(w http.ResponseWriter, r *http.Request) {
	project, slug := s.planParams(r)
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	content, err := s.store.ReadVersion(project, slug, n)
	if err != nil {
		http.Error(w, "version not found", 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"content": content, "version": n})
}

func (s *ServeServer) handleRestoreDashboard(w http.ResponseWriter, r *http.Request) {
	project, slug := s.planParams(r)
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	newVersion, err := s.store.RestoreVersion(project, slug, n)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	_ = s.store.WriteMeta(project, slug, "pending", newVersion)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "newVersion": newVersion})
}

func (s *ServeServer) handleGetAnnotationsDashboard(w http.ResponseWriter, r *http.Request) {
	project, slug := s.planParams(r)
	ver, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	data, err := s.store.ReadAnnotations(project, slug, ver)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":%d,"annotations":[]}`, ver)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (s *ServeServer) handleSaveAnnotationsDashboard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Project     string          `json:"project"`
		Slug        string          `json:"slug"`
		Version     int             `json:"version"`
		Annotations json.RawMessage `json:"annotations"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"version":     body.Version,
		"annotations": body.Annotations,
	})
	if err := s.store.WriteAnnotations(body.Project, body.Slug, body.Version, payload); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

func (s *ServeServer) handleSaveLocalDashboard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Project string `json:"project"`
		Slug    string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	version := s.store.CurrentVersion(body.Project, body.Slug)
	content, err := s.store.ReadVersion(body.Project, body.Slug, version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	destPath := s.cfg.SaveDestinations.Local.Path
	if destPath == "" || !s.cfg.SaveDestinations.Local.Enabled {
		destPath = strings.ReplaceAll("~/.openplan/exports/", "~", "")
	}
	if err := storage.SaveToLocalPath(content, body.Slug, destPath); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

func (s *ServeServer) handleSaveObsidianDashboard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Project string `json:"project"`
		Slug    string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	version := s.store.CurrentVersion(body.Project, body.Slug)
	content, err := s.store.ReadVersion(body.Project, body.Slug, version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	title := storage.SlugToTitle(body.Slug)
	path, err := saveToObsidian(s.cfg, body.Slug, title, content)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": path})
}

func (s *ServeServer) handleSaveNotionDashboard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Project string `json:"project"`
		Slug    string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	version := s.store.CurrentVersion(body.Project, body.Slug)
	content, err := s.store.ReadVersion(body.Project, body.Slug, version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	title := storage.SlugToTitle(body.Slug)
	pageID, pageURL, err := saveToNotion(s.cfg, title, content)
	if err != nil {
		if err == errNotionNotConfigured {
			http.Error(w, "notion not configured", 400)
			return
		}
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "pageId": pageID, "url": pageURL})
}
