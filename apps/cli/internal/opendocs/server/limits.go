package server

import (
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Limits are the abuse controls for a public proxy. Zero values disable the
// corresponding limit. They bound cost per client; they are not authentication.
type Limits struct {
	CreatePerHour int  // new documents per client IP per hour (POST /api/docs)
	WritePerMin   int  // all other mutating requests per client IP per minute
	MaxVersions   int  // versions kept per document
	MaxComments   int  // comments (incl. replies) per document
	MaxCommentLen int  // bytes in one comment body
	TrustProxy    bool // take the client IP from X-Forwarded-For (only behind your own reverse proxy)
}

// DefaultLimits are conservative settings for a public instance.
func DefaultLimits() Limits {
	return Limits{CreatePerHour: 20, WritePerMin: 120, MaxVersions: 200, MaxComments: 5000, MaxCommentLen: 10_000}
}

// WithLimits applies abuse controls (proxy mode).
func (s *Server) WithLimits(l Limits) *Server {
	s.limits = l
	s.createRL = newRateLimiter(l.CreatePerHour, time.Hour)
	s.writeRL = newRateLimiter(l.WritePerMin, time.Minute)
	return s
}

// limitWrites rejects mutating API requests from a client over its budget.
func (s *Server) limitWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.multiTenant() && strings.HasPrefix(r.URL.Path, "/api/") && r.Method != http.MethodGet && r.Method != http.MethodHead {
			rl := s.writeRL
			if r.Method == http.MethodPost && r.URL.Path == "/api/docs" {
				rl = s.createRL
			}
			if rl != nil {
				if retry, ok := rl.allow(s.clientIP(r)); !ok {
					w.Header().Set("Retry-After", itoa(int(retry.Seconds())+1))
					writeErr(w, http.StatusTooManyRequests, errors.New("rate limit exceeded; slow down"))
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) clientIP(r *http.Request) string {
	if s.limits.TrustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// The last entry is the one our own proxy appended; earlier ones are client-supplied.
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func itoa(n int) string {
	if n <= 0 {
		return "1"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// rateLimiter is a per-key token bucket: capacity n, refilled evenly over window.
type rateLimiter struct {
	mu      sync.Mutex
	n       float64
	rate    float64 // tokens per second
	buckets map[string]*bucket
	last    time.Time // last sweep
	now     func() time.Time
}

type bucket struct {
	tokens float64
	at     time.Time
}

func newRateLimiter(n int, window time.Duration) *rateLimiter {
	if n <= 0 {
		return nil
	}
	return &rateLimiter{n: float64(n), rate: float64(n) / window.Seconds(), buckets: map[string]*bucket{}, now: time.Now}
}

// allow spends one token for key. When refused, retry is how long until one is available.
func (rl *rateLimiter) allow(key string) (retry time.Duration, ok bool) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	if now.Sub(rl.last) > time.Minute {
		for k, b := range rl.buckets { // drop idle, fully refilled buckets
			if b.tokens+now.Sub(b.at).Seconds()*rl.rate >= rl.n {
				delete(rl.buckets, k)
			}
		}
		rl.last = now
	}
	b := rl.buckets[key]
	if b == nil {
		b = &bucket{tokens: rl.n, at: now}
		rl.buckets[key] = b
	}
	b.tokens = min(rl.n, b.tokens+now.Sub(b.at).Seconds()*rl.rate)
	b.at = now
	if b.tokens < 1 {
		return time.Duration((1 - b.tokens) / rl.rate * float64(time.Second)), false
	}
	b.tokens--
	return 0, true
}
