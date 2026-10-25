# AGENTS.md — vYtDL CLI (daemon source)

Go CLI + `vytdl serve` daemon wrapping yt-dlp. This is the monorepo's canonical
Go source for the desktop/web product line.

The standalone CLI distribution — with its agent skills (`vytdl-cli`,
`x-video-dl`) and Chinese docs — is the independent project
[qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)
(local: `~/innate/innate-works/projects/innate-vytdl`, issue #32).

## Quick commands

```bash
go build -o vYtDL .
go test ./...
./vYtDL download --no-tui -o ./downloads "URL"
```

## Rules of thumb

- Prefer changing `internal/downloader` for yt-dlp behavior; keep Desktop/Web out of this repo.
- Do not add a URL domain whitelist — site coverage is yt-dlp’s job.
- Pass through cookie/proxy/extractor-args rather than reimplementing auth.
- Update `USAGE.md` when adding user-facing flags.
