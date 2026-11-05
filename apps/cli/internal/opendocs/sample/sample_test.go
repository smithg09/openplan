package sample

import (
	"strings"
	"testing"
)

// The sample is held to the same rules the guidelines give agents.
func TestSampleFollowsTheGuidelines(t *testing.T) {
	h := HTML()
	for _, want := range []string{"<!doctype html>", `<html lang="en">`, "<title>", `data-theme="dark"`, "prefers-color-scheme", "<h1>", "<h2>"} {
		if !strings.Contains(h, want) {
			t.Errorf("sample is missing %q", want)
		}
	}
	for _, bad := range []string{"https://", "http://", "<link rel=\"stylesheet\"", "src=\"http", "localStorage", "sessionStorage", "fetch("} {
		if strings.Contains(h, bad) {
			t.Errorf("sample must be self-contained and sandbox-safe, found %q", bad)
		}
	}
	if len(h) > 200_000 {
		t.Errorf("sample too large: %d bytes", len(h))
	}
}
