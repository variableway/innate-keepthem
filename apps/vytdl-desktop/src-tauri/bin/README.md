# bin/ - vYtDL CLI sidecar

This directory holds the **vYtDL CLI sidecar binary** bundled with the desktop
app via Tauri `externalBin` (`tauri.conf.json` -> `bundle.externalBin`).

## One CLI, one source

The sidecar is **not** a separate binary. It is built from the single monorepo
CLI source at `vYtDL-standalone/` (mirror of
https://github.com/qdriven/innate-vytdl). The desktop app and the standalone
CLI therefore always run the same code.

## Staging

Binaries are named `vYtDL-<target-triple>[.exe]` (e.g.
`vYtDL-aarch64-apple-darwin`) as Tauri requires, are **gitignored**, and are
staged automatically by the build script:

```bash
# stage only (build CLI for host platform into bin/)
python3 scripts/build-desktop.py cli

# dev / build stage the sidecar automatically first
python3 scripts/build-desktop.py dev
python3 scripts/build-desktop.py build
```

Cross-compile: `python3 scripts/build-desktop.py build --target x86_64-pc-windows-msvc`
(GOOS/GOARCH are mapped from the Rust triple automatically).

## Runtime resolution

The app resolves the CLI in this order (see `find_vytdl_cli()` in
`src/vtt_analysis.rs`):

1. Bundled sidecar next to the app binary
2. `VYTDL_CLI_PATH` env var
3. Monorepo checkout: `vYtDL-standalone/vYtDL` or staged `src-tauri/bin/vYtDL-*`
4. `vYtDL` on `PATH`

Note: the yt-dlp engine binaries are bundled separately under
`resources/yt-dlp/` (see `scripts/download-yt-dlp-binaries.py`).
