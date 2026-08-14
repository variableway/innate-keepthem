#!/usr/bin/env python3
"""
Download yt-dlp standalone binaries for bundling with the desktop app.

Usage:
    python scripts/download-yt-dlp-binaries.py

Downloads platform-specific zip bundles and extracts them into src-tauri/resources/yt-dlp/.
"""

import os
import sys
import urllib.request
import zipfile
from pathlib import Path

# Platform zip bundles from yt-dlp GitHub releases
PLATFORMS = {
    "macos": "yt-dlp_macos.zip",
    "windows-x86": "yt-dlp_win_x86.zip",
    "windows-arm64": "yt-dlp_win_arm64.zip",
}

RELEASE_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/"


def get_project_root() -> Path:
    return Path(__file__).parent.parent.resolve()


def get_resources_dir() -> Path:
    return (
        get_project_root() / "apps" / "desktop" / "src-tauri" / "resources" / "yt-dlp"
    )


def download_file(url: str, dest: Path) -> bool:
    print(f"Downloading: {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as response:
            with open(dest, "wb") as f:
                f.write(response.read())
        return True
    except Exception as e:
        print(f"  Failed: {e}")
        return False


def extract_zip(zip_path: Path, dest_dir: Path) -> bool:
    print(f"Extracting: {zip_path} -> {dest_dir}")
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(dest_dir)
        return True
    except Exception as e:
        print(f"  Failed: {e}")
        return False


def main() -> int:
    resources_dir = get_resources_dir()
    print(f"Target directory: {resources_dir}")
    print()

    success = 0
    failed = 0

    for platform, zip_name in PLATFORMS.items():
        platform_dir = resources_dir / platform

        # Check if already extracted
        marker = platform_dir / ".downloaded"
        if marker.exists():
            print(f"[SKIP] {platform} already extracted")
            success += 1
            continue

        # Download to temp location
        zip_path = resources_dir / zip_name
        url = f"{RELEASE_URL}{zip_name}"

        if not zip_path.exists():
            if not download_file(url, zip_path):
                failed += 1
                continue

        # Extract
        if extract_zip(zip_path, platform_dir):
            # Create marker file
            marker.write_text("")
            # Remove zip to save space
            zip_path.unlink()
            # Make executable on Unix
            if platform == "macos":
                exe = platform_dir / "yt-dlp_macos"
                if exe.exists():
                    os.chmod(exe, 0o755)
            print(f"  Done: {platform_dir}")
            success += 1
        else:
            failed += 1

    print()
    print(f"Results: {success} ok, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
