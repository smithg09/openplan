package main

import (
	"github.com/smithg09/openplan/cli/cmd"
)

// version is set at build time via -ldflags "-X main.version=..."
var version = "dev"

func main() {
	cmd.SetVersion(version)
	cmd.Execute()
}
