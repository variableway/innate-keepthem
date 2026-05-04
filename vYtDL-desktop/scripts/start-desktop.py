#!/usr/bin/env python3
"""
vYtDL Desktop Launcher - Cross-platform startup script

Supports macOS, Linux, and Windows.

Usage:
    python scripts/start-desktop.py
"""

import os
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.resolve()


def check_command(cmd: list[str]) -> bool:
    """Check if a command exists in PATH."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            shell=(sys.platform == "win32" and cmd[0] == "where"),
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def run_command(cmd: list[str], cwd: Path) -> int:
    """Run a shell command and stream output."""
    print(f"[INFO] Running: {' '.join(cmd)}")
    print(f"[INFO] Working directory: {cwd}")
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    if process.stdout:
        for line in process.stdout:
            print(line, end="", flush=True)
    return process.wait()


def main() -> int:
    project_dir = get_project_root()

    # Check for pnpm
    if sys.platform == "win32":
        has_pnpm = check_command(["where", "pnpm"])
    else:
        has_pnpm = check_command(["which", "pnpm"])

    if not has_pnpm:
        print("[ERROR] pnpm is not installed or not in PATH.")
        print("[INFO] Please install pnpm: https://pnpm.io/installation")
        return 1

    # Check for Rust (required by Tauri)
    has_rust = check_command(["rustc", "--version"])
    if not has_rust:
        print("[WARN] Rust does not appear to be installed.")
        print("[INFO] Tauri requires Rust. Install it from: https://rustup.rs/")
        # Continue anyway — user might have it in a non-standard location

    print(f"[INFO] Project directory: {project_dir}")
    print("[INFO] Starting vYtDL Desktop in development mode...")

    return run_command(["pnpm", "tauri:dev"], cwd=project_dir)


if __name__ == "__main__":
    sys.exit(main())
