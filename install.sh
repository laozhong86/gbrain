#!/usr/bin/env sh

set -eu

REPO_SLUG="${GBRAIN_REPO_SLUG:-laozhong86/gbrain}"
INSTALL_DIR="${GBRAIN_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="${GBRAIN_BINARY_NAME:-gbrain}"
OPENCLAW_PLUGIN_DIR="${GBRAIN_OPENCLAW_PLUGIN_DIR:-$HOME/.local/share/gbrain/openclaw-plugin}"
WITH_OPENCLAW=0
VERSION=""

usage() {
  cat <<'EOF'
Usage: install.sh [--version <tag>] [--dir <install-dir>] [--bin-name <name>] [--with-openclaw]

Installs the compiled gbrain binary from GitHub Releases into ~/.local/bin by default.

Options:
  --version <tag>      Install a specific release tag, for example v0.1.0.
  --dir <path>         Override the install directory.
  --bin-name <name>    Override the installed binary name.
  --with-openclaw      Also clone the plugin package and install it into OpenClaw.
  --help               Show this help text.
EOF
}

log() {
  printf '%s\n' "$*" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

detect_asset_name() {
  platform="$(uname -s)"
  arch="$(uname -m)"

  case "$platform-$arch" in
    Darwin-arm64)
      printf '%s\n' "gbrain-darwin-arm64"
      ;;
    Darwin-x86_64)
      printf '%s\n' "gbrain-darwin-x64"
      ;;
    Linux-x86_64)
      printf '%s\n' "gbrain-linux-x64"
      ;;
    *)
      log "Unsupported platform: $platform-$arch"
      exit 1
      ;;
  esac
}

release_url() {
  asset_name="$1"

  if [ -n "$VERSION" ]; then
    printf '%s\n' "https://github.com/$REPO_SLUG/releases/download/$VERSION/$asset_name"
  else
    printf '%s\n' "https://github.com/$REPO_SLUG/releases/latest/download/$asset_name"
  fi
}

install_binary() {
  asset_name="$(detect_asset_name)"
  url="$(release_url "$asset_name")"
  target="$INSTALL_DIR/$BINARY_NAME"
  tmp_dir="$(mktemp -d)"
  tmp_file="$tmp_dir/$asset_name"

  trap 'rm -rf "$tmp_dir"' EXIT INT TERM HUP

  mkdir -p "$INSTALL_DIR"
  log "Downloading $url"
  curl -fsSL "$url" -o "$tmp_file"
  chmod +x "$tmp_file"
  mv "$tmp_file" "$target"
  rm -rf "$tmp_dir"
  trap - EXIT INT TERM HUP

  log "Installed $target"
  "$target" version
}

install_openclaw_plugin() {
  require_cmd git
  require_cmd openclaw

  repo_ref="https://github.com/$REPO_SLUG.git"

  mkdir -p "$(dirname "$OPENCLAW_PLUGIN_DIR")"
  if [ -d "$OPENCLAW_PLUGIN_DIR/.git" ]; then
    log "Updating OpenClaw plugin checkout in $OPENCLAW_PLUGIN_DIR"
    git -C "$OPENCLAW_PLUGIN_DIR" fetch --tags origin
    if [ -n "$VERSION" ]; then
      git -C "$OPENCLAW_PLUGIN_DIR" checkout "$VERSION"
    else
      git -C "$OPENCLAW_PLUGIN_DIR" checkout main
      git -C "$OPENCLAW_PLUGIN_DIR" pull --ff-only origin main
    fi
  else
    rm -rf "$OPENCLAW_PLUGIN_DIR"
    log "Cloning OpenClaw plugin checkout to $OPENCLAW_PLUGIN_DIR"
    git clone --depth=1 "$repo_ref" "$OPENCLAW_PLUGIN_DIR"
    if [ -n "$VERSION" ]; then
      git -C "$OPENCLAW_PLUGIN_DIR" fetch --depth=1 origin "refs/tags/$VERSION:refs/tags/$VERSION"
      git -C "$OPENCLAW_PLUGIN_DIR" checkout "$VERSION"
    fi
  fi

  log "Installing OpenClaw plugin"
  openclaw plugins install --link "$OPENCLAW_PLUGIN_DIR/plugins/openclaw"
  log "Restarting OpenClaw gateway"
  openclaw gateway restart
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --bin-name)
      BINARY_NAME="${2:-}"
      shift 2
      ;;
    --with-openclaw)
      WITH_OPENCLAW=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

require_cmd curl

install_binary

if [ "$WITH_OPENCLAW" -eq 1 ]; then
  install_openclaw_plugin
fi
