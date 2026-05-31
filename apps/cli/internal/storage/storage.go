package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"
)

type Storage struct {
	baseDir string
}

type Meta struct {
	Slug           string `json:"slug"`
	Title          string `json:"title"`
	ProjectSlug    string `json:"projectSlug"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	Status         string `json:"status"`
	CurrentVersion int    `json:"currentVersion"`
	TotalVersions  int    `json:"totalVersions"`
}

type Session struct {
	PID       int    `json:"pid"`
	Port      int    `json:"port"`
	URL       string `json:"url"`
	Mode      string `json:"mode"`
	Project   string `json:"project"`
	StartedAt string `json:"startedAt"`
	Label     string `json:"label"`
}

func New() *Storage {
	base := filepath.Join(os.Getenv("HOME"), ".openplan", "plans")
	return &Storage{baseDir: base}
}

// NewWithBase creates a Storage rooted at a custom base directory (used in tests).
func NewWithBase(base string) *Storage {
	return &Storage{baseDir: base}
}

var nonSlugRe = regexp.MustCompile(`[^a-zA-Z0-9-]+`)

func DeriveProjectSlug(cwd string) string {
	if cwd == "" {
		cwd = "unknown"
	}
	slug := nonSlugRe.ReplaceAllString(cwd, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "unknown"
	}
	return slug
}

func DerivePlanSlug(content string) string {
	lines := strings.SplitN(content, "\n", 10)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") {
			title := strings.TrimLeft(line, "# ")
			title = strings.TrimSpace(title)
			if title != "" {
				return toSlug(title)
			}
		}
	}
	return fmt.Sprintf("plan-%d", time.Now().Unix())
}

func toSlug(s string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (s *Storage) planDir(projectSlug, planSlug string) string {
	return filepath.Join(s.baseDir, projectSlug, planSlug)
}

func (s *Storage) WriteVersion(projectSlug, planSlug, content string) (int, error) {
	dir := s.planDir(projectSlug, planSlug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, err
	}
	version := s.nextVersion(dir)
	path := filepath.Join(dir, fmt.Sprintf("v%d.md", version))
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return 0, err
	}
	return version, nil
}

func (s *Storage) nextVersion(dir string) int {
	for v := 1; ; v++ {
		if _, err := os.Stat(filepath.Join(dir, fmt.Sprintf("v%d.md", v))); os.IsNotExist(err) {
			return v
		}
	}
}

func (s *Storage) CurrentVersion(projectSlug, planSlug string) int {
	dir := s.planDir(projectSlug, planSlug)
	v := 0
	for i := 1; ; i++ {
		if _, err := os.Stat(filepath.Join(dir, fmt.Sprintf("v%d.md", i))); os.IsNotExist(err) {
			return v
		}
		v = i
	}
}

func (s *Storage) ReadVersion(projectSlug, planSlug string, version int) (string, error) {
	path := filepath.Join(s.planDir(projectSlug, planSlug), fmt.Sprintf("v%d.md", version))
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *Storage) ListVersions(projectSlug, planSlug string) ([]map[string]interface{}, error) {
	dir := s.planDir(projectSlug, planSlug)
	var versions []map[string]interface{}
	for v := 1; ; v++ {
		path := filepath.Join(dir, fmt.Sprintf("v%d.md", v))
		info, err := os.Stat(path)
		if os.IsNotExist(err) {
			break
		}
		if err != nil {
			return nil, err
		}
		versions = append(versions, map[string]interface{}{
			"number":    v,
			"createdAt": info.ModTime().UTC().Format(time.RFC3339),
		})
	}
	return versions, nil
}

func (s *Storage) WriteMeta(projectSlug, planSlug, status string, version int) error {
	dir := s.planDir(projectSlug, planSlug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	metaPath := filepath.Join(dir, "meta.json")
	now := time.Now().UTC().Format(time.RFC3339)

	meta := Meta{
		Slug:           planSlug,
		Title:          slugToTitle(planSlug),
		ProjectSlug:    projectSlug,
		UpdatedAt:      now,
		Status:         status,
		CurrentVersion: version,
		TotalVersions:  version,
	}

	existing, err := s.ReadMeta(projectSlug, planSlug)
	if err == nil {
		meta.CreatedAt = existing.CreatedAt
	} else {
		meta.CreatedAt = now
	}

	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(metaPath, data, 0644)
}

func (s *Storage) ReadMeta(projectSlug, planSlug string) (*Meta, error) {
	path := filepath.Join(s.planDir(projectSlug, planSlug), "meta.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var meta Meta
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

// WriteAnnotations persists annotations for a specific version.
func (s *Storage) WriteAnnotations(projectSlug, planSlug string, version int, payload json.RawMessage) error {
	dir := s.planDir(projectSlug, planSlug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	path := filepath.Join(dir, fmt.Sprintf("v%d.annotations.json", version))
	return os.WriteFile(path, payload, 0644)
}

// ReadAnnotations returns the raw annotations JSON for a version.
func (s *Storage) ReadAnnotations(projectSlug, planSlug string, version int) (json.RawMessage, error) {
	path := filepath.Join(s.planDir(projectSlug, planSlug), fmt.Sprintf("v%d.annotations.json", version))
	return os.ReadFile(path)
}

// WriteDraft saves an unsaved edit draft.
func (s *Storage) WriteDraft(planSlug string, payload json.RawMessage) error {
	dir := filepath.Join(os.Getenv("HOME"), ".openplan", "drafts")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	path := filepath.Join(dir, planSlug+".draft.json")
	return os.WriteFile(path, payload, 0644)
}

// ReadDraft loads the draft for a plan slug.
func (s *Storage) ReadDraft(planSlug string) (json.RawMessage, error) {
	path := filepath.Join(os.Getenv("HOME"), ".openplan", "drafts", planSlug+".draft.json")
	return os.ReadFile(path)
}

// RestoreVersion writes a new snapshot from an existing version's content.
func (s *Storage) RestoreVersion(projectSlug, planSlug string, fromVersion int) (int, error) {
	content, err := s.ReadVersion(projectSlug, planSlug, fromVersion)
	if err != nil {
		return 0, fmt.Errorf("reading version %d: %w", fromVersion, err)
	}
	return s.WriteVersion(projectSlug, planSlug, content)
}

// ListProjects returns all project slugs that have stored plans.
func (s *Storage) ListProjects() ([]string, error) {
	entries, err := os.ReadDir(s.baseDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var projects []string
	for _, e := range entries {
		if e.IsDir() {
			projects = append(projects, e.Name())
		}
	}
	return projects, nil
}

// ListPlans returns all plan metas for a project.
func (s *Storage) ListPlans(projectSlug string) ([]*Meta, error) {
	projectDir := filepath.Join(s.baseDir, projectSlug)
	entries, err := os.ReadDir(projectDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var metas []*Meta
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		meta, err := s.ReadMeta(projectSlug, e.Name())
		if err != nil {
			continue
		}
		metas = append(metas, meta)
	}
	return metas, nil
}

// ── Session management ────────────────────────────────────────────────────

func sessionsDir() string {
	return filepath.Join(os.Getenv("HOME"), ".openplan", "sessions")
}

func WriteSession(session *Session) error {
	dir := sessionsDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	path := filepath.Join(dir, fmt.Sprintf("%d.json", session.PID))
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func RemoveSession(pid int) error {
	path := filepath.Join(sessionsDir(), fmt.Sprintf("%d.json", pid))
	return os.Remove(path)
}

// ListSessions returns active sessions and removes stale ones.
func ListSessions() ([]*Session, error) {
	dir := sessionsDir()
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var sessions []*Session
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		pidStr := strings.TrimSuffix(e.Name(), ".json")
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}

		// Check if process is alive
		if !isProcessAlive(pid) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var s Session
		if err := json.Unmarshal(data, &s); err != nil {
			continue
		}
		sessions = append(sessions, &s)
	}
	return sessions, nil
}

func isProcessAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil
}

// ── Save integrations ─────────────────────────────────────────────────────

// SaveToLocalPath writes a plan to the configured local directory.
func SaveToLocalPath(content, planSlug, destPath string) error {
	// Expand ~ in path
	if strings.HasPrefix(destPath, "~/") {
		destPath = filepath.Join(os.Getenv("HOME"), destPath[2:])
	}
	if err := os.MkdirAll(destPath, 0755); err != nil {
		return err
	}
	date := time.Now().Format("2006-01-02")
	filename := filepath.Join(destPath, fmt.Sprintf("%s-%s.md", date, planSlug))
	return os.WriteFile(filename, []byte(content), 0644)
}

// ── Helpers ───────────────────────────────────────────────────────────────

// SlugToTitle converts a slug like "my-plan" to "My Plan".
func SlugToTitle(slug string) string {
	return slugToTitle(slug)
}

func slugToTitle(slug string) string {
	words := strings.Split(slug, "-")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
