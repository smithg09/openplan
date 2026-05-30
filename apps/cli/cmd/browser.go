package cmd

import (
	"fmt"
	"os/exec"
	"runtime"
)

func openBrowser(browser, url string) error {
	if browser != "" && browser != "default" {
		return openWithBrowser(browser, url)
	}
	return openDefault(url)
}

func openWithBrowser(browser, url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-a", browser, url).Start()
	case "linux":
		return exec.Command(browser, url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", browser, url).Start()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func openDefault(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}
