package search

import (
	"reflect"
	"strings"
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
)

func TestParse(t *testing.T) {
	q := Parse(`launch "rollout plan" -draft  Beta`)
	if !reflect.DeepEqual(q.Words, []string{"launch", "beta"}) {
		t.Errorf("words = %v", q.Words)
	}
	if !reflect.DeepEqual(q.Phrases, []string{"rollout plan"}) {
		t.Errorf("phrases = %v", q.Phrases)
	}
	if !reflect.DeepEqual(q.Not, []string{"draft"}) {
		t.Errorf("not = %v", q.Not)
	}
	if !Parse("  ").Empty() || !Parse(`-only`).Empty() {
		t.Error("blank and exclusion-only queries are empty")
	}
}

func TestTextAndTitle(t *testing.T) {
	src := `<!doctype html><html><head><title>Q3 &amp; Q4 Plan</title><style>p{color:red}</style>
<script>var secret = "hidden words";</script></head><body><!-- note --><h1>Heading</h1>
<p>We   ship <b>beta</b> on Friday.</p></body></html>`
	text := Text(src)
	for _, bad := range []string{"secret", "hidden", "color:red", "note", "<"} {
		if strings.Contains(text, bad) {
			t.Errorf("text leaked %q: %s", bad, text)
		}
	}
	if strings.Contains(text, "Q3") {
		t.Errorf("<title> belongs to Title(), not the body text: %q", text)
	}
	if !strings.Contains(text, "We ship beta on Friday.") {
		t.Errorf("text = %q", text)
	}
	if got := Title(src); got != "Q3 & Q4 Plan" {
		t.Errorf("title = %q", got)
	}
	if got := Title(`<body><h1>Only <i>H1</i></h1></body>`); got != "Only H1" {
		t.Errorf("h1 fallback = %q", got)
	}
	if Title("<p>none</p>") != "" {
		t.Error("no title/h1 → empty")
	}
}

func TestMatchSemantics(t *testing.T) {
	text := "We launch the beta on Friday with a staged rollout plan for design partners"
	cases := []struct {
		q    string
		want bool
	}{
		{"launch beta", true},
		{"launch gamma", false},
		{"laun", true},
		{"unch", false},
		{`"rollout plan"`, true},
		{`"plan rollout"`, false},
		{"beta -friday", false},
		{"beta -thursday", true},
		{"BETA", true},
	}
	for _, c := range cases {
		if _, _, ok := Match(Parse(c.q), "Spec", text); ok != c.want {
			t.Errorf("Match(%q) = %v, want %v", c.q, ok, c.want)
		}
	}
	st, _, _ := Match(Parse("beta"), "Beta guide", "unrelated beta")
	sb, _, _ := Match(Parse("beta"), "Guide", "beta beta")
	if st <= sb {
		t.Errorf("title score %d should exceed body score %d", st, sb)
	}
}

func TestSnippet(t *testing.T) {
	text := strings.Repeat("alpha ", 40) + "NEEDLE here " + strings.Repeat("omega ", 40)
	at := strings.Index(strings.ToLower(text), "needle")
	s := Snippet(text, at, 80)
	if !strings.Contains(s, "NEEDLE") || !strings.HasPrefix(s, "… ") || !strings.HasSuffix(s, " …") || len([]rune(s)) > 100 {
		t.Errorf("snippet = %q", s)
	}
	if s := Snippet("short text", 0, 80); s != "short text" {
		t.Errorf("short snippet = %q", s)
	}
}

func TestProject(t *testing.T) {
	b := store.NewWithBase(t.TempDir()).Backend()
	put := func(slug, html string) {
		if _, err := b.Doc("p", slug).CreateVersion([]byte(html), "", "", ""); err != nil {
			t.Fatal(err)
		}
	}
	put("spec", `<title>Launch spec</title><body><p>Ship the beta in September.</p></body>`)
	put("rca", `<body><h1>Outage RCA</h1><p>The beta flag caused it; launch was delayed.</p></body>`)
	put("notes", `<body><p>Unrelated meeting notes.</p></body>`)
	b.Doc("p", "empty").AddComment(store.Comment{Body: "x"})
	put("other", `<body>beta</body>`)

	res, err := Project(b, "p", Parse("beta launch"))
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 || res[0].Doc != "spec" || res[1].Doc != "rca" {
		t.Fatalf("results = %+v", res)
	}
	if res[0].Title != "Launch spec" || res[1].Title != "Outage RCA" || res[0].VersionID == "" || res[0].Snippet == "" {
		t.Errorf("result fields = %+v", res)
	}
	if res, _ := Project(b, "p", Parse("beta -outage")); len(res) != 2 {
		t.Errorf("exclusion: %+v", res)
	}
	if res, _ := Project(b, "p", Parse("")); res != nil {
		t.Error("empty query returns nothing")
	}
}
