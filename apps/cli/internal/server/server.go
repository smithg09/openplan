package server

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/smithg09/openplan/cli/internal/config"
	"github.com/smithg09/openplan/cli/internal/storage"
)

//go:embed ui/dist
var uiAssets embed.FS

type Server struct {
	cfg         *config.Config
	event       *HookEvent
	projectSlug string
	planSlug    string
	planLabel   string
	version     int
	binVersion  string
	store       *storage.Storage

	dirRoot  string
	dirFiles []string

	decision chan string
	httpSrv  *http.Server
}

// WithDirectory enables directory-browsing mode. root must be an absolute path;
// files is a sorted list of paths relative to root.
func (s *Server) WithDirectory(root string, files []string) {
	s.dirRoot = root
	s.dirFiles = files
}

// WithLabel sets the display label (e.g. filename) for the plan.
func (s *Server) WithLabel(label string) {
	s.planLabel = label
}

// planTitle extracts a human-readable title from the plan content.
// Falls back to the filename label, then slug-derived title.
func (s *Server) planTitle() string {
	for _, line := range strings.SplitN(s.event.ToolInput.Plan, "\n", 20) {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(line[2:])
		}
	}
	if s.planLabel != "" && s.planLabel != "untitled" {
		base := filepath.Base(s.planLabel)
		name := strings.TrimSuffix(base, filepath.Ext(base))
		words := strings.FieldsFunc(name, func(r rune) bool { return r == '-' || r == '_' })
		for i, w := range words {
			if len(w) > 0 {
				words[i] = strings.ToUpper(w[:1]) + w[1:]
			}
		}
		return strings.Join(words, " ")
	}
	return storage.SlugToTitle(s.planSlug)
}

func New(
	cfg *config.Config,
	event *HookEvent,
	projectSlug, planSlug string,
	version int,
	store *storage.Storage,
	binVersion string,
) *Server {
	return &Server{
		cfg:         cfg,
		event:       event,
		projectSlug: projectSlug,
		planSlug:    planSlug,
		version:     version,
		binVersion:  binVersion,
		store:       store,
		decision:    make(chan string, 1),
	}
}

func (s *Server) Start() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("finding available port: %w", err)
	}

	mux := http.NewServeMux()

	// Directory-browsing endpoints (active when WithDirectory is used)
	mux.HandleFunc("GET /api/files", s.handleGetFiles)
	mux.HandleFunc("GET /api/file", s.handleGetFile)

	// Core hook endpoints
	mux.HandleFunc("GET /api/plan", s.handleGetPlan)
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("POST /api/approve", s.handleApprove)
	mux.HandleFunc("POST /api/deny", s.handleDeny)

	// Version history endpoints
	mux.HandleFunc("GET /api/versions", s.handleGetVersions)
	mux.HandleFunc("GET /api/version/{n}", s.handleGetVersion)
	mux.HandleFunc("POST /api/restore/{n}", s.handleRestoreVersion)

	// Annotations endpoints
	mux.HandleFunc("GET /api/annotations/{version}", s.handleGetAnnotations)
	mux.HandleFunc("POST /api/annotations", s.handleSaveAnnotations)

	// Draft endpoint
	mux.HandleFunc("POST /api/draft", s.handleSaveDraft)

	// Save integrations
	mux.HandleFunc("POST /api/save/local", s.handleSaveLocal)
	mux.HandleFunc("POST /api/save/obsidian", s.handleSaveObsidian)
	mux.HandleFunc("POST /api/save/notion", s.handleSaveNotion)

	// Share relay
	mux.HandleFunc("POST /api/relay/store", HandleRelayStore)
	mux.HandleFunc("GET /api/relay/fetch/{token}", HandleRelayFetch)

	// Health check
	mux.HandleFunc("GET /healthz", handleHealthz)

	uiFS, err := fs.Sub(uiAssets, "ui/dist")
	if err != nil {
		return 0, fmt.Errorf("preparing UI assets: %w", err)
	}
	// SPA fallback: serve index.html for non-API, non-static paths
	mux.Handle("/", spaHandler(http.FileServer(http.FS(uiFS)), uiFS))

	s.httpSrv = &http.Server{Handler: mux}

	go func() {
		_ = s.httpSrv.Serve(listener)
	}()

	return listener.Addr().(*net.TCPAddr).Port, nil
}

func (s *Server) WaitForDecision() string {
	decision := <-s.decision
	time.Sleep(1500 * time.Millisecond)
	return decision
}

func (s *Server) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.httpSrv.Shutdown(ctx)
}

// ── Core handlers ────────────────────────────────────────────────────────

func (s *Server) handleGetPlan(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"plan":        s.event.ToolInput.Plan,
		"slug":        s.planSlug,
		"projectSlug": s.projectSlug,
		"version":     s.version,
		"title":       s.planTitle(),
	})
}

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	mode := "hook"
	if s.dirRoot != "" {
		mode = "annotate-dir"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"autoCloseDelay": s.cfg.AutoCloseDelay,
		"theme":          s.cfg.Theme,
		"mode":           mode,
		"version":        s.binVersion,
	})
}

// ── Directory browsing ────────────────────────────────────────────────────

func (s *Server) getAnnotationCount(relPath string) int {
	abs := filepath.Clean(filepath.Join(s.dirRoot, relPath))
	data, err := os.ReadFile(abs)
	if err != nil {
		return 0
	}
	slug := storage.DerivePlanSlug(string(data))
	if slug == "" {
		slug = "annotate"
	}
	ver := s.store.CurrentVersion(s.projectSlug, slug)
	if ver == 0 {
		return 0
	}
	annData, err := s.store.ReadAnnotations(s.projectSlug, slug, ver)
	if err != nil {
		return 0
	}
	var payload struct {
		Annotations []interface{} `json:"annotations"`
	}
	if err := json.Unmarshal(annData, &payload); err != nil {
		return 0
	}
	return len(payload.Annotations)
}

func (s *Server) handleGetFiles(w http.ResponseWriter, r *http.Request) {
	if s.dirRoot == "" {
		http.Error(w, "not in directory mode", 404)
		return
	}
	counts := make(map[string]int)
	for _, f := range s.dirFiles {
		counts[f] = s.getAnnotationCount(f)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"dir":              s.dirRoot,
		"files":            s.dirFiles,
		"annotationCounts": counts,
	})
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	if s.dirRoot == "" {
		http.Error(w, "not in directory mode", 404)
		return
	}
	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		http.Error(w, "missing path query param", 400)
		return
	}
	// Prevent path traversal: resolve and confirm the result is inside dirRoot.
	abs := filepath.Clean(filepath.Join(s.dirRoot, relPath))
	if abs != s.dirRoot && !strings.HasPrefix(abs, s.dirRoot+string(filepath.Separator)) {
		http.Error(w, "path outside directory", 403)
		return
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		http.Error(w, "file not found", 404)
		return
	}

	content := string(data)
	derivedSlug := storage.DerivePlanSlug(content)
	if derivedSlug == "" {
		derivedSlug = "annotate"
	}
	s.planSlug = derivedSlug

	currentVer := s.store.CurrentVersion(s.projectSlug, s.planSlug)
	if currentVer == 0 {
		newVer, err := s.store.WriteVersion(s.projectSlug, s.planSlug, content)
		if err == nil {
			s.version = newVer
			_ = s.store.WriteMeta(s.projectSlug, s.planSlug, "pending", newVer)
		} else {
			s.version = 1
		}
	} else {
		s.version = currentVer
	}

	// Fetch annotations
	annoData, err := s.store.ReadAnnotations(s.projectSlug, s.planSlug, s.version)
	var annotations []interface{} = make([]interface{}, 0)
	if err == nil {
		var annoPayload struct {
			Annotations []interface{} `json:"annotations"`
		}
		if err := json.Unmarshal(annoData, &annoPayload); err == nil {
			annotations = annoPayload.Annotations
		}
	}

	// Fetch versions
	rawVersions, err := s.store.ListVersions(s.projectSlug, s.planSlug)
	var versions []map[string]interface{} = make([]map[string]interface{}, 0)
	if err == nil {
		for _, v := range rawVersions {
			num := v["number"].(int)
			status := "pending"
			if num == s.version {
				status = "current"
			} else if num < s.version {
				status = "superseded"
			}
			var label interface{}
			if num == s.version {
				label = "current"
			}
			versions = append(versions, map[string]interface{}{
				"version":     num,
				"timestamp":   v["createdAt"],
				"source":      "cli",
				"status":      status,
				"annotations": 0,
				"label":       label,
			})
		}
		// Reverse
		for i, j := 0, len(versions)-1; i < j; i, j = i+1, j-1 {
			versions[i], versions[j] = versions[j], versions[i]
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"path":        relPath,
		"content":     content,
		"slug":        s.planSlug,
		"version":     s.version,
		"annotations": annotations,
		"versions":    versions,
	})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
	// Check for edited content and mode in request body
	var body struct {
		EditedContent string `json:"editedContent"`
		Mode          string `json:"mode"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Snapshot edited content if provided
	contentToSnapshot := s.event.ToolInput.Plan
	if body.EditedContent != "" {
		contentToSnapshot = body.EditedContent
	}

	decision := buildApproveDecision(body.Mode)
	s.sendDecision(decision)

	existing, err := s.store.ReadVersion(s.projectSlug, s.planSlug, s.version)
	if err != nil || existing != contentToSnapshot {
		newVersion, snapErr := s.store.WriteVersion(s.projectSlug, s.planSlug, contentToSnapshot)
		if snapErr == nil {
			s.version = newVersion
		}
	}

	if err := s.store.WriteMeta(s.projectSlug, s.planSlug, "approved", s.version); err != nil {
		fmt.Fprintf(w, `{"ok":false,"error":"meta write failed"}`)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

func (s *Server) handleDeny(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message       string `json:"message"`
		EditedContent string `json:"editedContent"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// If there's edited content, snapshot it first
	if body.EditedContent != "" {
		existing, err := s.store.ReadVersion(s.projectSlug, s.planSlug, s.version)
		if err != nil || existing != body.EditedContent {
			newVersion, snapErr := s.store.WriteVersion(s.projectSlug, s.planSlug, body.EditedContent)
			if snapErr == nil {
				s.version = newVersion
				_ = s.store.WriteMeta(s.projectSlug, s.planSlug, "denied", newVersion)
			}
		}
	}

	decision := buildDenyDecision(body.Message)
	s.sendDecision(decision)

	if err := s.store.WriteMeta(s.projectSlug, s.planSlug, "denied", s.version); err != nil {
		fmt.Fprintf(w, `{"ok":false,"error":"meta write failed"}`)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

// ── Version history ───────────────────────────────────────────────────────

func (s *Server) handleGetVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := s.store.ListVersions(s.projectSlug, s.planSlug)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"versions":       versions,
		"currentVersion": s.version,
	})
}

func (s *Server) handleGetVersion(w http.ResponseWriter, r *http.Request) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	content, err := s.store.ReadVersion(s.projectSlug, s.planSlug, n)
	if err != nil {
		http.Error(w, "version not found", 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"content": content, "version": n})
}

func (s *Server) handleRestoreVersion(w http.ResponseWriter, r *http.Request) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	newVersion, err := s.store.RestoreVersion(s.projectSlug, s.planSlug, n)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	s.version = newVersion
	_ = s.store.WriteMeta(s.projectSlug, s.planSlug, "pending", newVersion)

	// Reload event plan content
	content, _ := s.store.ReadVersion(s.projectSlug, s.planSlug, newVersion)
	s.event.ToolInput.Plan = content

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "newVersion": newVersion})
}

// ── Annotations ───────────────────────────────────────────────────────────

func (s *Server) handleGetAnnotations(w http.ResponseWriter, r *http.Request) {
	ver, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		http.Error(w, "invalid version", 400)
		return
	}
	data, err := s.store.ReadAnnotations(s.projectSlug, s.planSlug, ver)
	if err != nil {
		// No annotations yet — return empty
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":%d,"annotations":[]}`, ver)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (s *Server) handleSaveAnnotations(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Version     int             `json:"version"`
		Annotations json.RawMessage `json:"annotations"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	ver := body.Version
	if ver == 0 {
		ver = s.version
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"version":     ver,
		"annotations": body.Annotations,
	})
	if err := s.store.WriteAnnotations(s.projectSlug, s.planSlug, ver, payload); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

// ── Draft ─────────────────────────────────────────────────────────────────

func (s *Server) handleSaveDraft(w http.ResponseWriter, r *http.Request) {
	data, err := json.Marshal(struct {
		PlanSlug string    `json:"planSlug"`
		SavedAt  time.Time `json:"savedAt"`
	}{PlanSlug: s.planSlug, SavedAt: time.Now().UTC()})
	_ = data

	var body json.RawMessage
	if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Merge plan slug into the body
	var m map[string]interface{}
	_ = json.Unmarshal(body, &m)
	m["planSlug"] = s.planSlug
	m["savedAt"] = time.Now().UTC().Format(time.RFC3339)
	payload, _ := json.Marshal(m)

	if err := s.store.WriteDraft(s.planSlug, payload); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

// ── Save integrations ─────────────────────────────────────────────────────

func (s *Server) handleSaveLocal(w http.ResponseWriter, r *http.Request) {
	destPath := s.cfg.SaveDestinations.Local.Path
	if destPath == "" {
		destPath = "~/.openplan/exports/"
	}
	content, err := s.store.ReadVersion(s.projectSlug, s.planSlug, s.version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if err := storage.SaveToLocalPath(content, s.planSlug, destPath); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true}`)
}

func (s *Server) handleSaveObsidian(w http.ResponseWriter, r *http.Request) {
	content, err := s.store.ReadVersion(s.projectSlug, s.planSlug, s.version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	title := storage.SlugToTitle(s.planSlug)
	path, err := saveToObsidian(s.cfg, s.planSlug, title, content)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": path})
}

func (s *Server) handleSaveNotion(w http.ResponseWriter, r *http.Request) {
	content, err := s.store.ReadVersion(s.projectSlug, s.planSlug, s.version)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	title := storage.SlugToTitle(s.planSlug)
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

// ── Internal helpers ─────────────────────────────────────────────────────

func (s *Server) sendDecision(decision string) {
	select {
	case s.decision <- decision:
	default:
	}
}

func buildApproveDecision(mode string) string {
	decision := map[string]interface{}{
		"behavior": "allow",
	}
	switch mode {
	case "auto":
		decision["permissionMode"] = "bypassPermissions"
	case "plan-only":
		decision["permissionMode"] = "planOnly"
	}
	d := map[string]interface{}{
		"hookSpecificOutput": map[string]interface{}{
			"hookEventName": "PermissionRequest",
			"decision":      decision,
		},
	}
	b, _ := json.Marshal(d)
	return string(b) + "\n"
}

func buildDenyDecision(message string) string {
	d := map[string]interface{}{
		"hookSpecificOutput": map[string]interface{}{
			"hookEventName": "PermissionRequest",
			"decision": map[string]interface{}{
				"behavior": "deny",
				"message":  message,
			},
		},
	}
	b, _ := json.Marshal(d)
	return string(b) + "\n"
}

// ── Shared save helpers ───────────────────────────────────────────────────

var errNotionNotConfigured = fmt.Errorf("notion token not configured")

func expandPath(p string) string {
	if strings.HasPrefix(p, "~/") {
		return filepath.Join(os.Getenv("HOME"), p[2:])
	}
	return p
}

func saveToObsidian(cfg *config.Config, slug, title, content string) (string, error) {
	obs := cfg.SaveDestinations.Obsidian
	vaultPath := obs.VaultPath
	if vaultPath == "" {
		return "", fmt.Errorf("obsidian vaultPath not configured")
	}
	vaultPath = expandPath(vaultPath)

	folder := obs.Folder
	if folder == "" {
		folder = "OpenPlan"
	}
	dir := filepath.Join(vaultPath, folder)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	date := time.Now().Format("2006-01-02")
	frontmatter := fmt.Sprintf("---\ntitle: %s\ndate: %s\nstatus: approved\ntags: [openplan]\n---\n\n",
		title, date)
	fullContent := frontmatter + content

	filePath := filepath.Join(dir, slug+".md")
	if err := os.WriteFile(filePath, []byte(fullContent), 0644); err != nil {
		return "", err
	}
	return filePath, nil
}

func saveToNotion(cfg *config.Config, title, content string) (string, string, error) {
	notion := cfg.SaveDestinations.Notion
	if notion.Token == "" {
		return "", "", errNotionNotConfigured
	}
	if notion.ParentPageID == "" {
		return "", "", fmt.Errorf("notion parentPageId not configured")
	}

	// Convert markdown to Notion paragraph blocks
	var blocks []map[string]interface{}
	for _, line := range strings.Split(content, "\n") {
		if line == "" {
			continue
		}
		blocks = append(blocks, map[string]interface{}{
			"object": "block",
			"type":   "paragraph",
			"paragraph": map[string]interface{}{
				"rich_text": []map[string]interface{}{
					{
						"type": "text",
						"text": map[string]interface{}{"content": line},
					},
				},
			},
		})
	}

	payload := map[string]interface{}{
		"parent": map[string]interface{}{"page_id": notion.ParentPageID},
		"properties": map[string]interface{}{
			"title": []map[string]interface{}{
				{"text": map[string]interface{}{"content": title}},
			},
		},
		"children": blocks,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	req, err := http.NewRequest("POST", "https://api.notion.com/v1/pages", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+notion.Token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Notion-Version", "2022-06-28")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}
	if resp.StatusCode >= 400 {
		msg, _ := json.Marshal(result)
		return "", "", fmt.Errorf("notion API error %d: %s", resp.StatusCode, msg)
	}

	pageID, _ := result["id"].(string)
	pageURL, _ := result["url"].(string)
	return pageID, pageURL, nil
}

// handleHealthz returns a simple health check response.
func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"ok":true,"version":"0.2.0"}`)
}

// spaHandler returns a handler that serves static files and falls back to
// index.html for unmatched paths (enables client-side routing).
func spaHandler(fileServer http.Handler, uiFS fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(uiFS, path); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// Fall back to index.html for client-side routes
		r2 := *r
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, &r2)
	})
}
