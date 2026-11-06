#!/usr/bin/env bash
# Installs a release binary. Defaults to openplan; pass "opendocs" or "opendocs-proxy" to install those instead:
#   curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash
#   curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs
set -e
REPO="smithg09/openplan"
BIN="${1:-openplan}"
INSTALL_DIR="${OPENPLAN_INSTALL_DIR:-$HOME/.local/bin}"

case "$BIN" in
  openplan|opendocs|opendocs-proxy) ;;
  *) echo "Unknown binary: $BIN (expected openplan, opendocs or opendocs-proxy)" >&2; exit 1 ;;
esac

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
URL="https://github.com/$REPO/releases/download/$LATEST/${BIN}_${PLATFORM}.tar.gz"

echo "Installing $BIN $LATEST for $PLATFORM..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" | tar -xz -C "$INSTALL_DIR" "$BIN"
chmod +x "$INSTALL_DIR/$BIN"

echo ""
echo "Installed to $INSTALL_DIR/$BIN"

if [ "$BIN" = "opendocs" ]; then
  # Teach Claude Code about opendocs, unless the openplan plugin (which bundles the same skill) is already installed.
  if [ -d "$HOME/.claude" ]; then
    if grep -qs "openplan" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null; then
      echo ""
      echo "Claude Code: the openplan plugin is installed and already includes the opendocs skill."
    else
      echo ""
      echo "Found Claude Code (~/.claude). Installing the opendocs skill..."
      "$INSTALL_DIR/opendocs" install claude || echo "Could not install the skill; run 'opendocs install claude' yourself."
    fi
  else
    echo ""
    echo "To teach an agent about opendocs, run one of:"
    echo "  opendocs install claude | opendocs install codex | opendocs install agy"
  fi
fi

if [ "$BIN" = "openplan" ]; then
  echo ""
  echo "To set up the Claude Code plugin, open Claude Code and run:"
  echo "  /plugin marketplace add smithg09/openplan"
  echo "  /plugin install openplan@openplan"
  echo ""
  echo "That plugin also gives Claude Code the opendocs skill (install the opendocs binary too:"
  echo "  curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs)."
fi
