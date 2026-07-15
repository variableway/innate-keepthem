#!/usr/bin/env bash
# Bootstrap yt-dlp resources for Tauri dev builds when full binary download is unavailable.
# Copies a system yt-dlp into src-tauri/resources/yt-dlp/macos/ so `tauri dev` can compile.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RES_DIR="${SCRIPT_DIR}/../apps/desktop/src-tauri/resources/yt-dlp"
MACOS_DIR="${RES_DIR}/macos"
MARKER="${MACOS_DIR}/.downloaded"

if [[ -f "${MARKER}" ]]; then
  echo "[OK] yt-dlp dev resources already present: ${MACOS_DIR}"
  exit 0
fi

YTDLP=""
for candidate in "${YTDLP_BIN:-}" "$(command -v yt-dlp 2>/dev/null || true)" "/opt/homebrew/bin/yt-dlp" "/usr/local/bin/yt-dlp"; do
  if [[ -n "${candidate}" && -x "${candidate}" ]]; then
    YTDLP="${candidate}"
    break
  fi
done

if [[ -z "${YTDLP}" ]]; then
  echo "[ERROR] yt-dlp not found in PATH. Install with: brew install yt-dlp" >&2
  exit 1
fi

mkdir -p "${MACOS_DIR}" "${RES_DIR}/windows-x86" "${RES_DIR}/windows-arm64"
cp "${YTDLP}" "${MACOS_DIR}/yt-dlp_macos"
chmod +x "${MACOS_DIR}/yt-dlp_macos"
touch "${MARKER}"

echo "[OK] Bootstrapped dev yt-dlp from ${YTDLP} -> ${MACOS_DIR}/yt-dlp_macos"
echo "[INFO] For production bundles run: python3 scripts/download-yt-dlp-binaries.py"
