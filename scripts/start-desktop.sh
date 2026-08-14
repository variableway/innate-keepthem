#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

if ! command -v pnpm >/dev/null 2>&1; then
    echo "Error: pnpm is not installed." >&2
    echo "Please install pnpm (https://pnpm.io/installation) and try again." >&2
    exit 1
fi

echo "Starting vYtDL Desktop..."
echo "Project directory: ${PROJECT_DIR}"

pnpm tauri:dev
