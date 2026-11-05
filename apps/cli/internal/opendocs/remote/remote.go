// Package remote is the opendocs CLI's client for an opendocs-proxy, plus the
// small local state that remembers which file was published where.
package remote

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// HostedURL is the default hosted proxy. Empty until one is deployed; when it
// is set, publishing falls back to it only when the user has not chosen a proxy.
const HostedURL = ""

// ErrNoProxy means no proxy is configured and there is no hosted default.
var ErrNoProxy = errors.New("no proxy configured (use --proxy, $OPENDOCS_PROXY, or `opendocs config proxy <url>`)")

// Client talks to one opendocs-proxy.
type Client struct {
	Base string // e.g. https://docs.example.com
	HTTP *http.Client
}

// NewClient validates base (https, or http only for localhost) and returns a Client.
// The timeout is generous because free-tier hosts cold-start slowly.
func NewClient(base string) (*Client, error) {
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid proxy URL %q", base)
	}
	h := u.Hostname()
	local := h == "localhost" || h == "127.0.0.1" || h == "::1"
	if u.Scheme != "https" && !(local && u.Scheme == "http") {
		return nil, fmt.Errorf("proxy URL must be https (http is only allowed for localhost): %q", base)
	}
	if u.User != nil {
		return nil, errors.New("credentials in the proxy URL are not allowed")
	}
	return &Client{Base: u.Scheme + "://" + u.Host, HTTP: &http.Client{Timeout: 90 * time.Second}}, nil
}

func (c *Client) do(method, path, token string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.Base+path, body)
	if err != nil {
		return err
	}
	if method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		_ = json.Unmarshal(data, &e)
		if e.Error == "" {
			e.Error = strings.TrimSpace(string(data))
		}
		return fmt.Errorf("%s %s: %d %s", method, path, resp.StatusCode, e.Error)
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

// Created is the result of creating a document.
type Created struct {
	ID          string         `json:"id"`
	EditorToken string         `json:"editorToken"`
	Version     *store.Version `json:"version"`
}

// CreateDoc creates a new document with its first version.
func (c *Client) CreateDoc(html, label, summary string) (Created, error) {
	var out Created
	err := c.do("POST", "/api/docs", "", map[string]string{"html": html, "label": label, "summary": summary}, &out)
	return out, err
}

// PublishVersion adds a version to an existing document.
func (c *Client) PublishVersion(doc, token, html, label, summary string) (store.Version, error) {
	var out store.Version
	err := c.do("POST", "/api/docs/"+url.PathEscape(doc)+"/versions", token,
		map[string]string{"html": html, "label": label, "summary": summary}, &out)
	return out, err
}

// Comments lists a document's comments.
func (c *Client) Comments(doc, token string) ([]store.Comment, error) {
	var out struct {
		Comments []store.Comment `json:"comments"`
	}
	err := c.do("GET", "/api/docs/"+url.PathEscape(doc)+"/comments", token, nil, &out)
	return out.Comments, err
}

// Head returns the id of the newest version.
func (c *Client) Head(doc, token string) (string, error) {
	var out struct {
		Versions []store.Version `json:"versions"`
	}
	if err := c.do("GET", "/api/docs/"+url.PathEscape(doc)+"/versions", token, nil, &out); err != nil {
		return "", err
	}
	if len(out.Versions) == 0 {
		return "", nil
	}
	return out.Versions[len(out.Versions)-1].ID, nil
}

// MintShare creates a viewer/commenter/editor token for the document.
func (c *Client) MintShare(doc, token, role, label string) (string, error) {
	var out struct {
		Token string `json:"token"`
	}
	err := c.do("POST", "/api/docs/"+url.PathEscape(doc)+"/shares", token, map[string]string{"role": role, "label": label}, &out)
	return out.Token, err
}

// ShareURL builds the capability link for a token. The token is in the
// fragment so it is never sent to a server or logged.
func (c *Client) ShareURL(doc, token string) string {
	return c.Base + "/d/" + url.PathEscape(doc) + "#t=" + url.QueryEscape(token)
}

// ── local state ─────────────────────────────────────────────────────────────

// Published remembers where a local file lives on a proxy.
type Published struct {
	Proxy       string `json:"proxy"`
	ID          string `json:"id"`
	EditorToken string `json:"editorToken"`
}

type state struct {
	Proxy     string               `json:"proxy,omitempty"`     // configured default proxy
	Published map[string]Published `json:"published,omitempty"` // abs file path -> where
}

// State is the on-disk CLI state (~/.opendocs/state.json, 0600: it holds editor tokens).
type State struct {
	path string
	mu   sync.Mutex
}

// NewState returns the default state file location.
func NewState() *State {
	return &State{path: filepath.Join(os.Getenv("HOME"), ".opendocs", "state.json")}
}

// NewStateAt is for tests.
func NewStateAt(path string) *State { return &State{path: path} }

func (s *State) load() (state, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return state{}, nil
	}
	if err != nil {
		return state{}, err
	}
	var st state
	if err := json.Unmarshal(data, &st); err != nil {
		return state{}, fmt.Errorf("corrupt %s: %w", s.path, err)
	}
	return st, nil
}

func (s *State) save(st state) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(st, "", "  ")
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".state-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}

// Proxy resolves the proxy to use: explicit flag, then $OPENDOCS_PROXY, then the
// configured default, then the hosted default.
func (s *State) Proxy(flag string) (string, error) {
	if flag != "" {
		return flag, nil
	}
	if v := os.Getenv("OPENDOCS_PROXY"); v != "" {
		return v, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	st, err := s.load()
	if err != nil {
		return "", err
	}
	if st.Proxy != "" {
		return st.Proxy, nil
	}
	if HostedURL != "" {
		return HostedURL, nil
	}
	return "", ErrNoProxy
}

// SetProxy stores the default proxy ("" clears it).
func (s *State) SetProxy(u string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, err := s.load()
	if err != nil {
		return err
	}
	st.Proxy = u
	return s.save(st)
}

// Lookup returns where file was published, if it was.
func (s *State) Lookup(file string) (Published, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, err := s.load()
	if err != nil {
		return Published{}, false, err
	}
	p, ok := st.Published[file]
	return p, ok, nil
}

// Remember records where file was published.
func (s *State) Remember(file string, p Published) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, err := s.load()
	if err != nil {
		return err
	}
	if st.Published == nil {
		st.Published = map[string]Published{}
	}
	st.Published[file] = p
	return s.save(st)
}
