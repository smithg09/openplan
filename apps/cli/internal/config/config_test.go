package config

import (
	"os"
	"path/filepath"
	"testing"
)

func withTempHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	return dir
}

func TestLoadDefaults(t *testing.T) {
	withTempHome(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Port != 7432 {
		t.Errorf("Port = %d, want 7432", cfg.Port)
	}
	if cfg.Theme != "system" {
		t.Errorf("Theme = %q, want %q", cfg.Theme, "system")
	}
	if cfg.Browser != "default" {
		t.Errorf("Browser = %q, want %q", cfg.Browser, "default")
	}
	if !cfg.AutoSaveOnApprove {
		t.Error("AutoSaveOnApprove should default to true")
	}
}

func TestLoadCreatesConfigFile(t *testing.T) {
	home := withTempHome(t)

	Load()

	path := filepath.Join(home, ".openplan", "config.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("Load() should create config file when it doesn't exist")
	}
}

func TestWriteAndLoad(t *testing.T) {
	withTempHome(t)

	cfg := defaults
	cfg.Theme = "dark"
	cfg.Port = 9000
	cfg.Browser = "firefox"

	if err := Write(&cfg); err != nil {
		t.Fatalf("Write: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load after Write: %v", err)
	}

	if loaded.Theme != "dark" {
		t.Errorf("Theme = %q, want %q", loaded.Theme, "dark")
	}
	if loaded.Port != 9000 {
		t.Errorf("Port = %d, want 9000", loaded.Port)
	}
	if loaded.Browser != "firefox" {
		t.Errorf("Browser = %q, want %q", loaded.Browser, "firefox")
	}
}

func TestLoadMergesDefaults(t *testing.T) {
	home := withTempHome(t)

	// Write a partial config (only theme set)
	partial := `{"theme":"dark"}`
	path := filepath.Join(home, ".openplan", "config.json")
	os.MkdirAll(filepath.Dir(path), 0755)
	os.WriteFile(path, []byte(partial), 0644)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Theme != "dark" {
		t.Errorf("Theme = %q, want dark", cfg.Theme)
	}
	// Unset fields should have defaults
	if cfg.Port != 7432 {
		t.Errorf("Port = %d, want default 7432", cfg.Port)
	}
}

func TestConfigPath(t *testing.T) {
	home := withTempHome(t)
	got := ConfigPath()
	want := filepath.Join(home, ".openplan", "config.json")
	if got != want {
		t.Errorf("ConfigPath() = %q, want %q", got, want)
	}
}

func TestLoad_InvalidJSON(t *testing.T) {
	home := withTempHome(t)
	path := filepath.Join(home, ".openplan", "config.json")
	os.MkdirAll(filepath.Dir(path), 0755)
	os.WriteFile(path, []byte("{invalid json}"), 0644)

	_, err := Load()
	if err == nil {
		t.Error("expected error for invalid JSON config")
	}
}
