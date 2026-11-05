// Package search finds opendocs documents by their title and latest text.
//
// Query language (a subset of slashdocs'): every bare word must appear
// (case-insensitive; a word also matches longer words that start with it),
// "quoted text" must appear verbatim in order, and -word excludes documents
// containing it.
package search

import (
	"html"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

// Query is a parsed search expression.
type Query struct {
	Words   []string // each must appear (prefix match on word boundaries)
	Phrases []string // each must appear as a contiguous phrase
	Not     []string // none may appear
}

// Empty reports whether the query has no positive terms.
func (q Query) Empty() bool { return len(q.Words) == 0 && len(q.Phrases) == 0 }

// Parse splits raw into words, "phrases" and -exclusions.
func Parse(raw string) Query {
	var q Query
	rs := []rune(raw)
	for i := 0; i < len(rs); {
		switch {
		case unicode.IsSpace(rs[i]):
			i++
		case rs[i] == '"':
			j := i + 1
			for j < len(rs) && rs[j] != '"' {
				j++
			}
			if p := norm(string(rs[i+1 : j])); p != "" {
				q.Phrases = append(q.Phrases, p)
			}
			i = j + 1
		default:
			j := i
			for j < len(rs) && !unicode.IsSpace(rs[j]) {
				j++
			}
			tok := string(rs[i:j])
			i = j
			if strings.HasPrefix(tok, "-") && len(tok) > 1 {
				q.Not = append(q.Not, norm(tok[1:]))
			} else if w := norm(tok); w != "" {
				q.Words = append(q.Words, w)
			}
		}
	}
	return q
}

func norm(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

var (
	dropBlocks = regexp.MustCompile(`(?is)<(script|style|noscript|template|title)\b.*?</(?:script|style|noscript|template|title)\s*>`)
	comments   = regexp.MustCompile(`(?s)<!--.*?-->`)
	tags       = regexp.MustCompile(`(?s)<[^>]*>`)
	titleRe    = regexp.MustCompile(`(?is)<title\b[^>]*>(.*?)</title\s*>`)
	h1Re       = regexp.MustCompile(`(?is)<h1\b[^>]*>(.*?)</h1\s*>`)
)

// Text returns the visible text of an HTML document: scripts, styles and
// markup removed, entities decoded, whitespace collapsed.
func Text(src string) string {
	s := dropBlocks.ReplaceAllString(src, " ")
	s = comments.ReplaceAllString(s, " ")
	s = tags.ReplaceAllString(s, " ")
	return strings.Join(strings.Fields(html.UnescapeString(s)), " ")
}

// Title returns the document <title>, else its first <h1>, else "".
func Title(src string) string {
	for _, re := range []*regexp.Regexp{titleRe, h1Re} {
		if m := re.FindStringSubmatch(src); m != nil {
			if t := Text(m[1]); t != "" {
				return t
			}
		}
	}
	return ""
}

// containsWord returns the index of word in hay at a word start, or -1 at a word start (so "launch"
// matches "launches" but "unch" does not match "launch").
func containsWord(hay, word string) int {
	for from := 0; ; {
		i := strings.Index(hay[from:], word)
		if i < 0 {
			return -1
		}
		i += from
		if i == 0 || !isWordRune(lastRune(hay[:i])) {
			return i
		}
		from = i + 1
	}
}

func lastRune(s string) rune {
	rs := []rune(s)
	return rs[len(rs)-1]
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// Result is one matching document.
type Result struct {
	Doc       string `json:"doc"`
	Title     string `json:"title"`
	VersionID string `json:"versionId"`
	Snippet   string `json:"snippet"`
	Score     int    `json:"score"`
}

// Match scores one document against q; ok is false when it does not match.
// Title hits count more than body hits.
func Match(q Query, title, text string) (score int, snippetAt int, ok bool) {
	lt, lx := strings.ToLower(title), strings.ToLower(text)
	both := lt + " \n " + lx
	snippetAt = -1
	for _, n := range q.Not {
		if containsWord(both, n) >= 0 {
			return 0, 0, false
		}
	}
	for _, w := range q.Words {
		ti, xi := containsWord(lt, w), containsWord(lx, w)
		if ti < 0 && xi < 0 {
			return 0, 0, false
		}
		if ti >= 0 {
			score += 10
		}
		if xi >= 0 {
			score += 1 + strings.Count(lx, w)
			if snippetAt < 0 {
				snippetAt = xi
			}
		}
	}
	for _, p := range q.Phrases {
		ti, xi := strings.Index(lt, p), strings.Index(lx, p)
		if ti < 0 && xi < 0 {
			return 0, 0, false
		}
		if ti >= 0 {
			score += 15
		}
		if xi >= 0 {
			score += 5 + strings.Count(lx, p)
			if snippetAt < 0 {
				snippetAt = xi
			}
		}
	}
	return score, snippetAt, true
}

// Snippet returns ~width runes of text around byte offset at, trimmed to word
// boundaries with ellipses where cut.
func Snippet(text string, at, width int) string {
	if at < 0 {
		at = 0
	}
	rs := []rune(text)
	// at is a byte offset into the lowercase text; map it to a rune index.
	ri := len([]rune(text[:min(at, len(text))]))
	start := max(0, ri-width/3)
	end := min(len(rs), start+width)
	s := string(rs[start:end])
	if start > 0 {
		if i := strings.IndexByte(s, ' '); i >= 0 {
			s = s[i+1:]
		}
		s = "… " + s
	}
	if end < len(rs) {
		if i := strings.LastIndexByte(s, ' '); i > 0 {
			s = s[:i]
		}
		s += " …"
	}
	return s
}

// Project searches the documents of one project in a backend by their head
// version, best match first.
func Project(b store.Backend, project string, q Query) ([]Result, error) {
	if q.Empty() {
		return nil, nil
	}
	docs, err := b.ListDocs(project)
	if err != nil {
		return nil, err
	}
	var out []Result
	for _, slug := range docs {
		d := b.Doc(project, slug)
		head, err := d.Head()
		if err != nil {
			continue // a doc with no versions has nothing to search
		}
		content, err := d.ReadVersion(head.ID)
		if err != nil {
			continue
		}
		title := Title(string(content))
		if title == "" {
			title = slug
		}
		text := Text(string(content))
		score, at, ok := Match(q, title, text)
		if !ok {
			continue
		}
		out = append(out, Result{Doc: slug, Title: title, VersionID: head.ID, Snippet: Snippet(text, at, 160), Score: score})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Doc < out[j].Doc
	})
	return out, nil
}
