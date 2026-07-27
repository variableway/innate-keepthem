#!/usr/bin/env python3
"""
vYtDL Launcher - Development & Scheduling Tool

Usage:
    python vytdl-launcher.py dev      # Start development environment
    python vytdl-launcher.py build    # Full production build
    python vytdl-launcher.py clean    # Clean all build artifacts
    python vytdl-launcher.py schedule # Run scheduled download tasks
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

# Color codes for terminal output
COLOR = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "red": "\033[91m",
    "green": "\033[92m",
    "yellow": "\033[93m",
    "blue": "\033[94m",
    "magenta": "\033[95m",
    "cyan": "\033[96m",
}


def log(level: str, msg: str) -> None:
    """Print colored log message."""
    colors = {
        "info": COLOR["blue"],
        "success": COLOR["green"],
        "warn": COLOR["yellow"],
        "error": COLOR["red"],
        "cmd": COLOR["cyan"],
    }
    prefix = f"{colors.get(level, '')}[{level.upper()}]{COLOR['reset']}"
    print(f"{prefix} {msg}", flush=True)


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.resolve()


def get_desktop_dir() -> Path:
    """Get the desktop app directory."""
    return get_project_root() / "apps" / "desktop"


def run_command(cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None) -> int:
    """Run a shell command and stream output."""
    log("cmd", f"{' '.join(cmd)} (cwd: {cwd or Path.cwd()})")
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        env={**os.environ, **(env or {})},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    if process.stdout:
        for line in process.stdout:
            print(line, end="", flush=True)
    return process.wait()


class ProcessManager:
    """Manages multiple subprocesses for dev mode."""

    def __init__(self):
        self.processes: List[subprocess.Popen] = []
        self._shutdown = False

    def add(self, name: str, cmd: List[str], cwd: Optional[Path] = None) -> subprocess.Popen:
        """Start and track a subprocess."""
        log("info", f"Starting {COLOR['bold']}{name}{COLOR['reset']}...")
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.processes.append(proc)
        return proc

    def stream(self, name: str, proc: subprocess.Popen, color: str) -> None:
        """Stream process output with a colored prefix."""
        prefix = f"{COLOR[color]}[{name}]{COLOR['reset']}"
        if proc.stdout:
            for line in proc.stdout:
                print(f"{prefix} {line}", end="", flush=True)

    def shutdown(self, *_args) -> None:
        """Gracefully terminate all tracked processes."""
        if self._shutdown:
            return
        self._shutdown = True
        log("warn", "Shutting down processes...")
        for proc in self.processes:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        log("success", "All processes stopped.")
        sys.exit(0)


def cmd_dev() -> int:
    """Start the full development environment."""
    desktop = get_desktop_dir()
    pm = ProcessManager()

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, pm.shutdown)
    signal.signal(signal.SIGTERM, pm.shutdown)

    log("info", f"Project root: {get_project_root()}")
    log("info", f"Desktop app:  {desktop}")
    log("info", "Starting development environment...")
    print()

    # Start Next.js dev server
    frontend = pm.add(
        "frontend",
        ["pnpm", "next", "dev", "--port", "3002"],
        cwd=desktop,
    )

    # Wait a moment for Next.js to start
    time.sleep(2)

    # Start Tauri dev
    tauri = pm.add(
        "tauri",
        ["pnpm", "tauri", "dev"],
        cwd=desktop,
    )

    # Stream both outputs
    from threading import Thread

    t1 = Thread(target=pm.stream, args=("frontend", frontend, "cyan"))
    t2 = Thread(target=pm.stream, args=("tauri", tauri, "magenta"))
    t1.daemon = True
    t2.daemon = True
    t1.start()
    t2.start()

    # Wait for either process to exit
    while True:
        time.sleep(0.5)
        if frontend.poll() is not None:
            log("error", f"Frontend exited with code {frontend.returncode}")
            pm.shutdown()
            return frontend.returncode
        if tauri.poll() is not None:
            log("error", f"Tauri exited with code {tauri.returncode}")
            pm.shutdown()
            return tauri.returncode


def cmd_build() -> int:
    """Run a full production build."""
    desktop = get_desktop_dir()
    log("info", "Starting full production build...")

    # Step 1: Build frontend
    log("info", "Building Next.js frontend...")
    code = run_command(["pnpm", "build"], cwd=desktop)
    if code != 0:
        log("error", "Frontend build failed!")
        return code
    log("success", "Frontend build complete.")

    # Step 2: Build Rust backend
    log("info", "Building Tauri Rust backend...")
    code = run_command(["cargo", "build", "--release"], cwd=desktop / "src-tauri")
    if code != 0:
        log("error", "Rust build failed!")
        return code
    log("success", "Rust build complete.")

    log("success", "Full production build successful!")
    return 0


def cmd_clean() -> int:
    """Clean all build artifacts."""
    desktop = get_desktop_dir()
    paths_to_clean = [
        desktop / ".next",
        desktop / "out",
        desktop / "node_modules" / ".cache",
        desktop / "src-tauri" / "target",
    ]

    log("info", "Cleaning build artifacts...")
    for path in paths_to_clean:
        if path.exists():
            log("cmd", f"rm -rf {path}")
            if path.is_dir():
                import shutil
                shutil.rmtree(path)
            else:
                path.unlink()

    # Also clean packages/ui
    ui_dir = get_project_root() / "packages" / "ui"
    for name in [".turbo", ".cache"]:
        p = ui_dir / name
        if p.exists():
            import shutil
            shutil.rmtree(p)

    log("success", "Clean complete.")
    return 0


def cmd_schedule() -> int:
    """Run scheduled download tasks."""
    config_path = get_project_root() / "scripts" / "schedule.json"

    if not config_path.exists():
        # Create example config
        example = {
            "tasks": [
                {
                    "name": "Daily Playlist Backup",
                    "url": "https://www.youtube.com/playlist?list=...",
                    "cron": "0 2 * * *",
                    "quality": "1080",
                    "format": "mp4",
                    "output_dir": "~/Downloads/vYtDL/scheduled",
                    "enabled": False,
                }
            ],
            "settings": {
                "yt_dlp_path": "yt-dlp",
                "default_output_dir": "~/Downloads/vYtDL/scheduled",
            },
        }
        config_path.write_text(json.dumps(example, indent=2, ensure_ascii=False))
        log("warn", f"Created example schedule config: {config_path}")
        log("info", "Please edit the config and re-run.")
        return 0

    config = json.loads(config_path.read_text())
    tasks = [t for t in config.get("tasks", []) if t.get("enabled", False)]

    if not tasks:
        log("warn", "No enabled tasks found in schedule config.")
        return 0

    log("info", f"Running {len(tasks)} scheduled task(s)...")
    yt_dlp = config.get("settings", {}).get("yt_dlp_path", "yt-dlp")

    for task in tasks:
        name = task["name"]
        url = task["url"]
        output_dir = os.path.expanduser(task.get("output_dir", "~/Downloads/vYtDL/scheduled"))
        quality = task.get("quality", "best")
        fmt = task.get("format", "mp4")

        log("info", f"Task: {name}")
        log("cmd", f"URL: {url}")

        os.makedirs(output_dir, exist_ok=True)

        cmd = [
            yt_dlp,
            "--format", f"bestvideo[height<={quality}]+bestaudio/best" if quality != "best" else "best",
            "--merge-output-format", fmt,
            "--output", os.path.join(output_dir, "%(title)s.%(ext)s"),
            "--write-subs",
            "--sub-langs", "en,zh",
            "--no-playlist" if not task.get("is_playlist") else "--yes-playlist",
            url,
        ]

        code = run_command(cmd)
        if code == 0:
            log("success", f"Task '{name}' completed successfully.")
        else:
            log("error", f"Task '{name}' failed with exit code {code}.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="vYtDL Launcher - Development & Scheduling Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python vytdl-launcher.py dev       # Start dev environment
  python vytdl-launcher.py build     # Full production build
  python vytdl-launcher.py clean     # Clean artifacts
  python vytdl-launcher.py schedule  # Run scheduled downloads
        """,
    )
    parser.add_argument(
        "command",
        choices=["dev", "build", "clean", "schedule"],
        help="Command to run",
    )
    args = parser.parse_args()

    # Ensure we're in the right directory
    os.chdir(get_project_root())

    commands = {
        "dev": cmd_dev,
        "build": cmd_build,
        "clean": cmd_clean,
        "schedule": cmd_schedule,
    }

    return commands[args.command]()


if __name__ == "__main__":
    sys.exit(main())
