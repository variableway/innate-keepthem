#!/usr/bin/env python3
"""
vYtDL Desktop Build & Run Script — Cross-platform (macOS, Linux, Windows)

Supports development, production build, and distribution bundling.

Usage:
    python scripts/build-desktop.py dev              # Run in development mode
    python scripts/build-desktop.py build            # Build production app
    python scripts/build-desktop.py bundle           # Build + create installer/package
    python scripts/build-desktop.py check            # Check dependencies only

Options:
    --target <triple>    Cross-compile target (e.g., x86_64-pc-windows-msvc)
    --verbose, -v        Verbose output
    --skip-deps          Skip dependency installation step
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


# ───────────────────────────── Colors ─────────────────────────────
class Colors:
    HEADER = "\033[95m"
    OKBLUE = "\033[94m"
    OKCYAN = "\033[96m"
    OKGREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"


def color(text: str, code: str) -> str:
    if sys.platform == "win32" and not os.environ.get("TERM"):
        return text
    return f"{code}{text}{Colors.ENDC}"


def info(msg: str) -> None:
    print(f"{color('[INFO]', Colors.OKBLUE)} {msg}")


def ok(msg: str) -> None:
    print(f"{color('[OK]', Colors.OKGREEN)} {msg}")


def warn(msg: str) -> None:
    print(f"{color('[WARN]', Colors.WARNING)} {msg}")


def error(msg: str) -> None:
    print(f"{color('[ERROR]', Colors.FAIL)} {msg}", file=sys.stderr)


def step(msg: str) -> None:
    print(f"\n{color('▶', Colors.OKCYAN)} {color(msg, Colors.BOLD)}")


# ───────────────────────────── Paths ─────────────────────────────
def get_project_root() -> Path:
    return Path(__file__).parent.parent.resolve()


def get_tauri_src_dir(project_dir: Path) -> Path:
    return project_dir / "apps" / "desktop" / "src-tauri"


# ───────────────────────────── Dependency Checks ─────────────────────────────
def which(cmd: str) -> str | None:
    """Find command in PATH."""
    result = shutil.which(cmd)
    return result


def run_silently(cmd: list[str]) -> tuple[int, str, str]:
    """Run a command silently and return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except FileNotFoundError:
        return -1, "", f"Command not found: {cmd[0]}"


def check_deps() -> dict[str, dict[str, str | bool]]:
    """Check all required dependencies and return status."""
    deps = {}

    # pnpm
    pnpm_path = which("pnpm")
    deps["pnpm"] = {
        "found": pnpm_path is not None,
        "path": pnpm_path or "",
        "version": "",
        "install_hint": "Install pnpm: https://pnpm.io/installation",
    }
    if pnpm_path:
        rc, out, _ = run_silently([pnpm_path, "--version"])
        if rc == 0:
            deps["pnpm"]["version"] = out

    # Node.js
    node_path = which("node")
    deps["node"] = {
        "found": node_path is not None,
        "path": node_path or "",
        "version": "",
        "install_hint": "Install Node.js: https://nodejs.org/",
    }
    if node_path:
        rc, out, _ = run_silently([node_path, "--version"])
        if rc == 0:
            deps["node"]["version"] = out

    # Rust
    rustc_path = which("rustc")
    deps["rust"] = {
        "found": rustc_path is not None,
        "path": rustc_path or "",
        "version": "",
        "install_hint": "Install Rust: https://rustup.rs/",
    }
    if rustc_path:
        rc, out, _ = run_silently([rustc_path, "--version"])
        if rc == 0:
            deps["rust"]["version"] = out

    # cargo
    cargo_path = which("cargo")
    deps["cargo"] = {
        "found": cargo_path is not None,
        "path": cargo_path or "",
        "version": "",
        "install_hint": "Install Rust: https://rustup.rs/",
    }
    if cargo_path:
        rc, out, _ = run_silently([cargo_path, "--version"])
        if rc == 0:
            deps["cargo"]["version"] = out

    # git
    git_path = which("git")
    deps["git"] = {
        "found": git_path is not None,
        "path": git_path or "",
        "version": "",
        "install_hint": "Install git: https://git-scm.com/",
    }
    if git_path:
        rc, out, _ = run_silently([git_path, "--version"])
        if rc == 0:
            deps["git"]["version"] = out.splitlines()[0]

    return deps


def print_deps(deps: dict[str, dict[str, str | bool]]) -> None:
    """Print dependency status in a table."""
    print()
    print(f"{'Dependency':<12} {'Status':<10} {'Version':<20} {'Path'}")
    print("-" * 70)
    for name, info in deps.items():
        found = info["found"]
        status = color("OK", Colors.OKGREEN) if found else color("MISSING", Colors.FAIL)
        version = info.get("version", "") or "-"
        path = info.get("path", "") or "-"
        print(f"{name:<12} {status:<10} {version:<20} {path}")
    print()


def verify_deps(required: list[str], deps: dict[str, dict[str, str | bool]]) -> bool:
    """Verify required dependencies are present."""
    missing = []
    for name in required:
        if not deps.get(name, {}).get("found", False):
            missing.append(name)

    if missing:
        error(f"Missing required dependencies: {', '.join(missing)}")
        for name in missing:
            hint = deps.get(name, {}).get("install_hint", "")
            if hint:
                info(f"  → {hint}")
        return False
    return True


# ───────────────────────────── Build Steps ─────────────────────────────
def install_deps(project_dir: Path, verbose: bool = False) -> bool:
    """Install Node dependencies via pnpm."""
    step("Installing Node dependencies")
    pnpm = which("pnpm")
    assert pnpm is not None

    cmd = [pnpm, "install"]
    if not verbose:
        cmd.append("--silent")

    return run_command(cmd, cwd=project_dir, verbose=verbose) == 0


def download_yt_dlp_binaries(project_dir: Path, verbose: bool = False) -> bool:
    """Download yt-dlp binaries for bundling."""
    resources_dir = project_dir / "apps" / "desktop" / "src-tauri" / "resources" / "yt-dlp"

    # Check if already extracted
    marker = resources_dir / ".downloaded"
    if marker.exists():
        info("yt-dlp binaries already present, skipping download")
        return True

    script = project_dir / "scripts" / "download-yt-dlp-binaries.py"
    if not script.exists():
        warn(f"Download script not found: {script}")
        return True  # Not fatal — user may have binaries already

    step("Downloading yt-dlp binaries")
    return run_command([sys.executable, str(script)], cwd=project_dir, verbose=verbose) == 0


def run_dev(project_dir: Path, target: str | None, verbose: bool = False) -> int:
    """Run the desktop app in development mode."""
    step("Starting vYtDL Desktop in development mode")
    info("Press Ctrl+C to stop")

    pnpm = which("pnpm")
    assert pnpm is not None

    cmd = [pnpm, "tauri", "dev"]
    if target:
        cmd.extend(["--target", target])

    return run_command(cmd, cwd=project_dir, verbose=verbose)


def run_build(project_dir: Path, target: str | None, verbose: bool = False) -> int:
    """Build the desktop app for production."""
    step("Building vYtDL Desktop for production")

    pnpm = which("pnpm")
    assert pnpm is not None

    cmd = [pnpm, "tauri", "build"]
    if target:
        cmd.extend(["--target", target])
    if verbose:
        cmd.append("--verbose")

    return run_command(cmd, cwd=project_dir, verbose=verbose)


def run_bundle(project_dir: Path, target: str | None, verbose: bool = False) -> int:
    """Build and bundle the desktop app (alias for build)."""
    rc = run_build(project_dir, target, verbose)
    if rc != 0:
        return rc

    step("Build complete")
    src_dir = get_tauri_src_dir(project_dir)

    # Show output locations
    targets_dir = src_dir / "target"
    if targets_dir.exists():
        info(f"Build artifacts: {targets_dir}")
        release_dir = targets_dir / "release" / "bundle"
        if release_dir.exists():
            ok(f"Installers/packages: {release_dir}")
            # List contents
            for item in sorted(release_dir.rglob("*")):
                if item.is_file():
                    size = item.stat().st_size
                    print(f"  {item.relative_to(release_dir)} ({format_size(size)})")

    return 0


def format_size(size: int) -> str:
    """Format byte size to human readable."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# ───────────────────────────── Command Runner ─────────────────────────────
def run_command(cmd: list[str], cwd: Path, verbose: bool = False) -> int:
    """Run a command with streamed output."""
    info(f"Running: {' '.join(cmd)}")
    info(f"Working directory: {cwd}")

    env = os.environ.copy()
    # Ensure pnpm is in PATH if found
    pnpm_dir = which("pnpm")
    if pnpm_dir:
        env["PATH"] = str(Path(pnpm_dir).parent) + os.pathsep + env.get("PATH", "")

    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
    )

    if process.stdout:
        for line in process.stdout:
            print(line, end="")

    return process.wait()


# ───────────────────────────── Main ─────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build and run vYtDL Desktop",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "command",
        choices=["dev", "build", "bundle", "check"],
        help="Action to perform",
    )
    parser.add_argument(
        "--target",
        metavar="TRIPLE",
        help="Rust target triple for cross-compilation (e.g., x86_64-pc-windows-msvc)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )
    parser.add_argument(
        "--skip-deps",
        action="store_true",
        help="Skip dependency installation step",
    )

    args = parser.parse_args()

    project_dir = get_project_root()
    info(f"Project directory: {project_dir}")
    info(f"Platform: {platform.system()} ({platform.machine()})")

    # ── Check dependencies ──
    step("Checking dependencies")
    deps = check_deps()
    print_deps(deps)

    if args.command == "check":
        required = ["pnpm", "node", "rust", "cargo"]
        ok_status = verify_deps(required, deps)
        return 0 if ok_status else 1

    # For dev/build/bundle, require core deps
    required = ["pnpm", "node"]
    if args.command in ("build", "bundle"):
        required.extend(["rust", "cargo"])

    if not verify_deps(required, deps):
        return 1

    # ── Install Node deps ──
    if not args.skip_deps:
        if not install_deps(project_dir, verbose=args.verbose):
            error("Failed to install dependencies")
            return 1

    # ── Download yt-dlp binaries ──
    if args.command in ("build", "bundle"):
        download_yt_dlp_binaries(project_dir, verbose=args.verbose)

    # ── Execute command ──
    if args.command == "dev":
        return run_dev(project_dir, args.target, verbose=args.verbose)
    elif args.command == "build":
        return run_build(project_dir, args.target, verbose=args.verbose)
    elif args.command == "bundle":
        return run_bundle(project_dir, args.target, verbose=args.verbose)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(130)
