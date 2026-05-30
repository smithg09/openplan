package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const (
	relayMaxBytes = 5 * 1024 * 1024 // 5 MB
	relayTTL      = 30 * 24 * time.Hour
)

type relayEntry struct {
	content   string
	expiresAt time.Time
}

// RelayStore is an in-memory store for shared plan payloads.
// It is intentionally not persisted — a server restart clears all entries.
type RelayStore struct {
	mu      sync.Mutex
	entries map[string]relayEntry
}

// NewRelayStore creates a RelayStore and starts a background cleanup goroutine.
func NewRelayStore() *RelayStore {
	rs := &RelayStore{
		entries: make(map[string]relayEntry),
	}
	go rs.cleanupLoop()
	return rs
}

// DefaultRelayStore is the package-level instance shared by both servers.
var DefaultRelayStore = NewRelayStore()

func (rs *RelayStore) cleanupLoop() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		rs.mu.Lock()
		now := time.Now()
		for token, entry := range rs.entries {
			if now.After(entry.expiresAt) {
				delete(rs.entries, token)
			}
		}
		rs.mu.Unlock()
	}
}

func (rs *RelayStore) store(content string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}
	token := hex.EncodeToString(b)

	rs.mu.Lock()
	rs.entries[token] = relayEntry{
		content:   content,
		expiresAt: time.Now().Add(relayTTL),
	}
	rs.mu.Unlock()
	return token, nil
}

func (rs *RelayStore) fetch(token string) (string, bool) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	entry, ok := rs.entries[token]
	if !ok || time.Now().After(entry.expiresAt) {
		delete(rs.entries, token)
		return "", false
	}
	return entry.content, true
}

// ── HTTP handlers ─────────────────────────────────────────────────────────

// HandleRelayStore handles POST /api/relay/store
func HandleRelayStore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", 400)
		return
	}
	if len(body.Content) > relayMaxBytes {
		http.Error(w, "payload too large (max 5MB)", 413)
		return
	}
	if body.Content == "" {
		http.Error(w, "content is required", 400)
		return
	}

	token, err := DefaultRelayStore.store(body.Content)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// HandleRelayFetch handles GET /api/relay/fetch/{token}
func HandleRelayFetch(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, "missing token", 400)
		return
	}
	content, ok := DefaultRelayStore.fetch(token)
	if !ok {
		http.Error(w, "not found", 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"content": content})
}
