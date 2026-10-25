#!/usr/bin/env python3
"""Stage resources for the Electron shell (refactor Sprint 2).

Builds/stages into apps/shell/resources/:
  - daemon/vytdl-<triple>[.exe]   Go daemon binaries (services/vytdl)
  - web/                          static frontend export (apps/web/out)

Usage:
  python3 scripts/build-shell-resources.py            # host platform only
  python3 scripts/build-shell-resources.py --all      # mac arm64/x64 + win x64
  python3 scripts/build-shell-resources.py --skip-web # daemon only
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SHELL = PROJECT / "apps" / "shell"
RESOURCES = SHELL / "resources"
CLI_DIR = PROJECT / "services" / "vytdl"
WEB_APP = PROJECT / "apps" / "web"

# electron-builder targets from apps/shell/electron-builder.yml
ALL_TARGETS = {
    "darwin-arm64": ("darwin", "arm64"),
    "darwin-amd64": ("darwin", "amd64"),
    "windows-amd64": ("windows", "amd64"),
}

HOST_TARGET = {
    ("darwin", "arm64"): "darwin-arm64",
    ("darwin", "amd64"): "darwin-amd64",
    ("windows", "amd64"): "windows-amd64",
    ("windows", "arm64"): "windows-amd64",  # builder targets x64; close enough for dev
    ("linux", "amd64"): "linux-amd64",
    ("linux", "arm64"): "linux-arm64",
}


def run(cmd: list[str], **kw) -> None:
    print(f"+ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kw)


def host_triple() -> str:
    import platform

    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "amd64"
    system = {"Darwin": "darwin", "Windows": "windows", "Linux": "linux"}[platform.system()]
    return HOST_TARGET[(system, arch)]


def build_web() -> None:
    print("== building web frontend (apps/web) ==")
    run(["pnpm", "--filter", "@vytdl/web", "build"], cwd=PROJECT)
    out = WEB_APP / "out"
    if not (out / "index.html").is_file():
        sys.exit(f"static export missing: {out}/index.html")
    dest = RESOURCES / "web"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(out, dest)
    print(f"staged web export -> {dest}")


def build_daemon(target: str) -> None:
    goos, goarch = {
        "darwin-arm64": ("darwin", "arm64"),
        "darwin-amd64": ("darwin", "amd64"),
        "windows-amd64": ("windows", "amd64"),
        "linux-amd64": ("linux", "amd64"),
        "linux-arm64": ("linux", "arm64"),
    }[target]
    exe = "vytdl.exe" if goos == "windows" else "vytdl"
    out_dir = RESOURCES / "daemon" / f"vytdl-{target}"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"== building daemon {target} ==")
    env = {
        **os.environ,
        "CGO_ENABLED": "0",
        "GOOS": goos,
        "GOARCH": goarch,
        "GOPROXY": "https://goproxy.cn,direct",
    }
    run(
        [
            "go",
            "build",
            "-trimpath",
            "-ldflags",
            "-s -w",
            "-o",
            str(out_dir / exe),
            ".",
        ],
        cwd=CLI_DIR,
        env=env,
    )
    print(f"staged daemon -> {out_dir / exe}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="build all packaged platforms")
    ap.add_argument("--skip-web", action="store_true", help="skip the frontend export")
    args = ap.parse_args()

    if not args.skip_web:
        build_web()

    targets = list(ALL_TARGETS) if args.all else [host_target_or_fallback()]
    for target in targets:
        build_daemon(target)

    print("done.")


def host_target_or_fallback() -> str:
    triple = host_triple()
    if triple not in ALL_TARGETS:
        print(f"note: host {triple} is not a packaged target; building it anyway for local dev")
    return triple


if __name__ == "__main__":
    main()
