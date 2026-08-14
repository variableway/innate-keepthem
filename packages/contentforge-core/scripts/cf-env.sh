#!/bin/bash
# ContentForge 环境变量 — source 此文件后使用 contentforge CLI
if [ -n "${ZSH_VERSION:-}" ]; then
  _cf_script="${(%):-%x}"
else
  _cf_script="${BASH_SOURCE[0]}"
fi
SCRIPT_DIR="$(cd "$(dirname "$_cf_script")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

export PATH="/opt/homebrew/bin:${PATH}"
export PATH="${REPO_ROOT}/.venv-cf/bin:${PATH}"
export PYTHONPATH="${REPO_ROOT}/contentforge/core/python:${PYTHONPATH}"
export CF_HOME="${REPO_ROOT}"
export CONTENTFORGE_VENV="${REPO_ROOT}/.venv-cf"
