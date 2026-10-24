# ── Stage 1: Build frontend (static export) ─────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./
COPY apps/vytdl-desktop/package.json ./apps/vytdl-desktop/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

RUN pnpm install

COPY apps/vytdl-desktop/ ./apps/vytdl-desktop/
COPY packages/ ./packages/

# output: "export" → static site in apps/vytdl-desktop/out
RUN cd apps/vytdl-desktop && pnpm build

# ── Stage 2: Build the Go daemon (services/vytdl, in-repo) ──────────────────
FROM golang:1.24-alpine AS daemon-builder
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /src/services/vytdl

COPY services/vytdl/go.mod services/vytdl/go.sum ./
RUN go mod download

COPY services/vytdl/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) \
    go build -trimpath -ldflags="-s -w" -o /out/vytdl .

# ── Stage 3: Production (daemon + static frontend) ──────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

COPY --from=daemon-builder /out/vytdl ./vytdl
COPY --from=frontend-builder /app/apps/vytdl-desktop/out ./out

RUN mkdir -p /app/data /app/downloads

ENV VYTDL_OUTPUT_DIR=/app/downloads
EXPOSE 3000

# Single process, single backend: the Go daemon serves both the API/WS and
# the static frontend. Data lives under /app/data (vytdl.db), downloads in
# /app/downloads — mount both as volumes.
CMD ["/app/vytdl", "serve", "--host", "0.0.0.0", "--port", "3000", "--static", "/app/out", "--home", "/app/data"]
