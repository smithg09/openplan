package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ── RelayStore ────────────────────────────────────────────────────────────

func newRelayStore() *RelayStore {
	return &RelayStore{entries: make(map[string]relayEntry)}
}

func TestRelayStore_StoreAndFetch(t *testing.T) {
	rs := newRelayStore()
	token, err := rs.store("hello world")
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	content, ok := rs.fetch(token)
	if !ok {
		t.Fatal("fetch returned not found")
	}
	if content != "hello world" {
		t.Errorf("content = %q, want %q", content, "hello world")
	}
}

func TestRelayStore_FetchMissingToken(t *testing.T) {
	rs := newRelayStore()
	_, ok := rs.fetch("nonexistent-token")
	if ok {
		t.Error("expected not found for missing token")
	}
}

func TestRelayStore_FetchExpiredToken(t *testing.T) {
	rs := newRelayStore()
	token, _ := rs.store("content")

	// Force expiry
	rs.mu.Lock()
	rs.entries[token] = relayEntry{content: "content", expiresAt: time.Now().Add(-time.Second)}
	rs.mu.Unlock()

	_, ok := rs.fetch(token)
	if ok {
		t.Error("expected expired token to return not found")
	}
}

func TestRelayStore_UniqueTokens(t *testing.T) {
	rs := newRelayStore()
	tokens := make(map[string]bool)
	for i := 0; i < 10; i++ {
		tok, err := rs.store("payload")
		if err != nil {
			t.Fatalf("store: %v", err)
		}
		if tokens[tok] {
			t.Errorf("duplicate token: %s", tok)
		}
		tokens[tok] = true
	}
}

// ── HandleRelayStore ──────────────────────────────────────────────────────

func TestHandleRelayStore_Success(t *testing.T) {
	body := `{"content":"some plan data"}`
	req := httptest.NewRequest(http.MethodPost, "/api/relay/store", strings.NewReader(body))
	w := httptest.NewRecorder()
	HandleRelayStore(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	var m map[string]string
	json.NewDecoder(w.Body).Decode(&m)
	if m["token"] == "" {
		t.Error("expected token in response")
	}
}

func TestHandleRelayStore_EmptyContent(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/relay/store", strings.NewReader(`{"content":""}`))
	w := httptest.NewRecorder()
	HandleRelayStore(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleRelayStore_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/relay/store", strings.NewReader(`{bad json}`))
	w := httptest.NewRecorder()
	HandleRelayStore(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleRelayStore_TooLarge(t *testing.T) {
	large := strings.Repeat("x", relayMaxBytes+1)
	body, _ := json.Marshal(map[string]string{"content": large})
	req := httptest.NewRequest(http.MethodPost, "/api/relay/store", strings.NewReader(string(body)))
	w := httptest.NewRecorder()
	HandleRelayStore(w, req)
	if w.Code != 413 {
		t.Errorf("status = %d, want 413", w.Code)
	}
}

// ── HandleRelayFetch ──────────────────────────────────────────────────────

func TestHandleRelayFetch_Success(t *testing.T) {
	// Store via handler first
	storeBody := `{"content":"plan content"}`
	storeReq := httptest.NewRequest(http.MethodPost, "/api/relay/store", strings.NewReader(storeBody))
	storeW := httptest.NewRecorder()
	HandleRelayStore(storeW, storeReq)
	var storeResp map[string]string
	json.NewDecoder(storeW.Body).Decode(&storeResp)
	token := storeResp["token"]

	// Fetch it
	req := httptest.NewRequest(http.MethodGet, "/api/relay/fetch/"+token, nil)
	req.SetPathValue("token", token)
	w := httptest.NewRecorder()
	HandleRelayFetch(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	var m map[string]string
	json.NewDecoder(w.Body).Decode(&m)
	if m["content"] != "plan content" {
		t.Errorf("content = %q", m["content"])
	}
}

func TestHandleRelayFetch_NotFound(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/relay/fetch/badtoken", nil)
	req.SetPathValue("token", "badtoken")
	w := httptest.NewRecorder()
	HandleRelayFetch(w, req)
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestHandleRelayFetch_MissingToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/relay/fetch/", nil)
	req.SetPathValue("token", "")
	w := httptest.NewRecorder()
	HandleRelayFetch(w, req)
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
