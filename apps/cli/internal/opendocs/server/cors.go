package server

import (
	"net/http"
	"strings"
)

// CORS for the hosted web app.
//
// The proxy is normally same-origin with its own UI and sends no CORS headers,
// which is what keeps other websites from driving it from a visitor's browser
// (see guardWrites). The hosted web app (opendocs.smithgajjar.dev/app) is a
// different origin that talks to a proxy directly, so a deployment can opt in
// to an explicit allow-list of origins. Only those exact origins get headers;
// there is no wildcard, and credentials (cookies) are never allowed — callers
// authenticate with a bearer token they hold themselves.

// WithCORS allows cross-origin requests from the given exact origins
// (for example "https://opendocs.smithgajjar.dev").
func (s *Server) WithCORS(origins []string) *Server {
	s.corsOrigins = map[string]bool{}
	for _, o := range origins {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" && o != "*" {
			s.corsOrigins[o] = true
		}
	}
	return s
}

func (s *Server) cors(next http.Handler) http.Handler {
	if len(s.corsOrigins) == 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.corsOrigins[origin] {
			h := w.Header()
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Origin", origin)
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Opendocs-User")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
