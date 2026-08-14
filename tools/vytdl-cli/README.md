# vYtDL CLI (monorepo working copy)

Prefer the standalone repo:

- Local: `/Users/patrick/innate/projects/vYtDL`
- GitHub: https://github.com/qdriven/innate-vytdl

```bash
git clone https://github.com/qdriven/innate-vytdl.git
cd innate-vytdl
go build -o vYtDL .
./vYtDL download --install-yt-dlp
```

## Bundled yt-dlp

```bash
go build -o vYtDL .
./vYtDL download --install-yt-dlp          # cache under ~/Library/Caches/vYtDL

# Single-file with embedded yt-dlp:
./scripts/fetch-ytdlp.sh --embed
go build -tags embed_ytdlp -o vYtDL .
EMBED=1 ./scripts/build.sh                 # all platforms
```

Resolve order: `--yt-dlp-bin` → PATH → embed → cache → GitHub download.

See [USAGE.md](./USAGE.md) and [MOVED.md](./MOVED.md).
