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

    print(f"[INFO] Project directory: {project_dir}")
    print("[INFO] Delegating to build-desktop.py dev ...")

    build_script = project_dir / "scripts" / "build-desktop.py"
    return run_command([sys.executable, str(build_script), "dev"], cwd=project_dir)


if __name__ == "__main__":
    sys.exit(main())
