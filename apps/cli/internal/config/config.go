package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type SaveDestLocal struct {
	Enabled bool   `json:"enabled"`
	Path    string `json:"path"`
}

type SaveDestRepo struct {
	Enabled      bool   `json:"enabled"`
	RelativePath string `json:"relativePath"`
}

type SaveDestObsidian struct {
	Enabled           bool   `json:"enabled"`
	VaultPath         string `json:"vaultPath"`
	Folder            string `json:"folder"`
	AutoSaveOnApprove bool   `json:"autoSaveOnApprove"`
}

type SaveDestNotion struct {
	Enabled           bool   `json:"enabled"`
	Token             string `json:"token"`
	ParentPageID      string `json:"parentPageId"`
	AutoSaveOnApprove bool   `json:"autoSaveOnApprove"`
}

type SaveDestinations struct {
	Local    SaveDestLocal    `json:"local"`
	Repo     SaveDestRepo     `json:"repo"`
	Obsidian SaveDestObsidian `json:"obsidian"`
	Notion   SaveDestNotion   `json:"notion"`
}

type Config struct {
	AutoSaveOnApprove      bool             `json:"autoSaveOnApprove"`
	DefaultSaveDestination string           `json:"defaultSaveDestination"`
	SaveDestinations       SaveDestinations `json:"saveDestinations"`
	AutoCloseDelay         string           `json:"autoCloseDelay"`
	Browser                string           `json:"browser"`
	Theme                  string           `json:"theme"`
	Port                   int              `json:"port"`
	ServePort              int              `json:"servePort"`
}

var defaults = Config{
	AutoSaveOnApprove:      true,
	DefaultSaveDestination: "local",
	SaveDestinations: SaveDestinations{
		Local: SaveDestLocal{Enabled: true, Path: "~/.openplan/exports/"},
		Repo:  SaveDestRepo{Enabled: false, RelativePath: ".openplan/plans/"},
	},
	AutoCloseDelay: "3",
	Browser:        "default",
	Theme:          "system",
	Port:           7432,
	ServePort:      7432,
}

func ConfigPath() string {
	return filepath.Join(os.Getenv("HOME"), ".openplan", "config.json")
}

func Load() (*Config, error) {
	path := ConfigPath()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := defaults
			if writeErr := Write(&cfg); writeErr != nil {
				_ = writeErr
			}
			return &cfg, nil
		}
		return nil, err
	}

	cfg := defaults
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func Write(cfg *Config) error {
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
