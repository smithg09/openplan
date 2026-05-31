package server

import (
	"github.com/smithg09/openplan/cli/internal/storage"
)

// storageWithBase creates a Storage pointed at a custom base directory.
// This is only used in tests to avoid touching $HOME.
func storageWithBase(base string) *storage.Storage {
	return storage.NewWithBase(base)
}
