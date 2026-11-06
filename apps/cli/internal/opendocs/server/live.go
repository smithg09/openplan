package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Live updates over Server-Sent Events.
//
// Events say only *that* something changed ("comments", "versions") — clients
// refetch through the normal authorised API, so the stream never carries
// document or comment content and needs no extra access rules beyond read.
// Delivery is in-process: one proxy instance. Behind several instances the
// stream would need a shared bus (Postgres LISTEN/NOTIFY or Redis); that is not
// built.

const (
	maxSubscribersPerDoc = 100
	heartbeat            = 25 * time.Second
)

type subscriber struct {
	mu       sync.Mutex
	pending  map[string]bool
	wake     chan struct{}
	presence int
}

func newSubscriber() *subscriber {
	return &subscriber{pending: map[string]bool{}, wake: make(chan struct{}, 1)}
}

// notify marks kind pending (coalescing repeats) and wakes the writer.
func (s *subscriber) notify(kind string) {
	s.mu.Lock()
	s.pending[kind] = true
	s.mu.Unlock()
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *subscriber) take() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.pending))
	for k := range s.pending {
		out = append(out, k)
	}
	s.pending = map[string]bool{}
	return out
}

// hub tracks the open streams per document.
type hub struct {
	mu   sync.Mutex
	subs map[string]map[*subscriber]struct{}

	// Idle detection: onIdle fires once the last viewer has been gone for
	// `grace` after at least one had connected. `opendocs review` uses it as
	// "the reviewer closed the tab", so no Submit button is needed.
	everJoined bool
	total      int
	grace      time.Duration
	idleTimer  *time.Timer
	onIdle     func()
}

func newHub() *hub { return &hub{subs: map[string]map[*subscriber]struct{}{}, grace: 8 * time.Second} }

func (h *hub) joinedLocked() {
	h.everJoined = true
	h.total++
	if h.idleTimer != nil {
		h.idleTimer.Stop()
		h.idleTimer = nil
	}
}

func (h *hub) leftLocked() {
	h.total--
	if h.total > 0 || !h.everJoined || h.onIdle == nil {
		return
	}
	h.idleTimer = time.AfterFunc(h.grace, func() {
		h.mu.Lock()
		empty := h.total == 0
		cb := h.onIdle
		h.mu.Unlock()
		if empty && cb != nil {
			cb()
		}
	})
}

// join registers a subscriber; ok is false when the document is at its cap.
func (h *hub) join(doc string) (*subscriber, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.subs[doc]
	if set == nil {
		set = map[*subscriber]struct{}{}
		h.subs[doc] = set
	}
	if len(set) >= maxSubscribersPerDoc {
		return nil, false
	}
	s := newSubscriber()
	set[s] = struct{}{}
	h.joinedLocked()
	h.broadcastLocked(doc, "presence")
	return s, true
}

func (h *hub) leave(doc string, s *subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subs[doc], s)
	h.leftLocked()
	if len(h.subs[doc]) == 0 {
		delete(h.subs, doc)
		return
	}
	h.broadcastLocked(doc, "presence")
}

func (h *hub) count(doc string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs[doc])
}

func (h *hub) publish(doc, kind string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(doc, kind)
}

func (h *hub) broadcastLocked(doc, kind string) {
	for s := range h.subs[doc] {
		s.notify(kind)
	}
}

// statusRecorder captures the status code so publishing happens only after a
// mutation actually succeeded.
type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(c int) { r.code = c; r.ResponseWriter.WriteHeader(c) }
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// publishAfter runs h and, if it was a successful write, tells subscribers what changed.
func (s *Server) publishAfter(w http.ResponseWriter, r *http.Request, h func(http.ResponseWriter)) {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		h(w)
		return
	}
	rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
	h(rec)
	if rec.code >= 300 {
		return
	}
	doc := r.PathValue("doc")
	switch {
	case strings.Contains(r.URL.Path, "/comments"):
		s.hub.publish(doc, "comments")
	case strings.Contains(r.URL.Path, "/versions"):
		s.hub.publish(doc, "versions")
	}
}

// handleEvents streams change notifications for one document (viewer+).
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request, _ principal) {
	rc := http.NewResponseController(w)
	doc := r.PathValue("doc")
	sub, ok := s.hub.join(doc)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, fmt.Errorf("too many live viewers on this document"))
		return
	}
	defer s.hub.leave(doc, sub)

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no") // don't let nginx-style proxies buffer the stream
	w.WriteHeader(http.StatusOK)
	// Hello: lets the client confirm the stream is live and learn the viewer count.
	sub.notify("presence")
	_ = rc.Flush()

	tick := time.NewTicker(heartbeat)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			_ = rc.Flush()
		case <-sub.wake:
			for _, kind := range sub.take() {
				ev := map[string]any{"type": kind}
				if kind == "presence" {
					ev["count"] = s.hub.count(doc)
				}
				b, _ := json.Marshal(ev)
				if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
					return
				}
			}
			_ = rc.Flush()
		}
	}
}
