package store_test

import (
	"testing"

	"github.com/smithg09/openplan/cli/internal/opendocs/store"
	"github.com/smithg09/openplan/cli/internal/opendocs/store/storetest"
)

// The filesystem store must satisfy the shared backend contract.
func TestFilesystemBackendContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) store.Backend {
		return store.NewWithBase(t.TempDir()).Backend()
	})
}
