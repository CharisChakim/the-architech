#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="CharisChakim/the-architech"
INSTALL_DIR="${ARCHITECH_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/the-architech}"
BIN_DIR="${ARCHITECH_BIN_DIR:-$HOME/.local/bin}"
ARCHIVE_URL="${ARCHITECH_ARCHIVE_URL:-https://github.com/${REPOSITORY}/archive/refs/heads/main.tar.gz}"

for command_name in node npm curl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing requirement: %s\n' "$command_name" >&2
    exit 1
  fi
done

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 14) ? 0 : 1)'; then
  printf 'Node.js 22.14 or newer is required. Current version: %s\n' "$(node --version)" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

printf 'Downloading The Architech...\n'
curl -fsSL "$ARCHIVE_URL" -o "$temp_dir/source.tar.gz"
tar -xzf "$temp_dir/source.tar.gz" -C "$temp_dir"
source_dir="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d -name 'the-architech-*' -print -quit)"
if [[ -z "$source_dir" ]]; then
  printf 'Downloaded archive did not contain the application.\n' >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
# Copying over the existing directory intentionally keeps data/ and .env when
# this installer is used for an update.
cp -a "$source_dir/." "$INSTALL_DIR/"

printf 'Installing dependencies and building production files...\n'
(
  cd "$INSTALL_DIR"
  npm ci
  npm run build
)

launcher="$BIN_DIR/the-architech"
{
  printf '#!/usr/bin/env bash\n'
  printf 'cd %q\n' "$INSTALL_DIR"
  printf 'exec npm start\n'
} > "$launcher"
chmod +x "$launcher"

printf '\nInstalled in: %s\n' "$INSTALL_DIR"
printf 'Start with: %s\n' "$launcher"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  printf 'Add %s to PATH to run: the-architech\n' "$BIN_DIR"
fi
printf 'Then open http://localhost:3000\n'
