#!/usr/bin/env bash
set -e
REPO="smithg09/openplan"
INSTALL_DIR="${OPENPLAN_INSTALL_DIR:-$HOME/.local/bin}"

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "$OS" in
    Darwin) OS="darwin" ;;
    Linux) OS="linux" ;;
    *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
  esac
  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac
  echo "${OS}_${ARCH}"
}

PLATFORM="$(detect_platform)"
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
URL="https://github.com/$REPO/releases/download/$LATEST/openplan_${PLATFORM}.tar.gz"

echo "Installing openplan $LATEST for $PLATFORM..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" | tar -xz -C "$INSTALL_DIR" openplan
chmod +x "$INSTALL_DIR/openplan"

echo ""
echo "Installed to $INSTALL_DIR/openplan"
echo ""
echo "To set up the Claude Code plugin, open Claude Code and run:"
echo "  /plugin marketplace add smithg09/openplan"
echo "  /plugin install openplan@openplan"
