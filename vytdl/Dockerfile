# ── Stage 1: Build frontend (static export) ─────────────────────────────────
# Build context is the repo ROOT (see vytdl/docker-compose.yml): the web app
# consumes the shared packages/ layer that lives outside vytdl/.
FROM node:20-slim AS frontend-builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./
COPY vytdl/apps/web/package.json ./vytdl/apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

RUN pnpm install

COPY vytdl/apps/web/ ./vytdl/apps/web/
COPY packages/ ./packages/

# output: "export" → static site in vytdl/apps/web/out
RUN cd vytdl/apps/web && pnpm build

# ── Stage 2: Build the Go daemon (vytdl/services/vytdl, in-repo) ─────────────
FROM golang:1.26-alpine AS daemon-builder
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /src/vytdl/services/vytdl

COPY vytdl/services/vytdl/go.mod vytdl/services/vytdl/go.sum ./
RUN go mod download

COPY vytdl/services/vytdl/ ./
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
COPY --from=frontend-builder /app/vytdl/apps/web/out ./out

RUN mkdir -p /app/data /app/downloads

ENV VYTDL_OUTPUT_DIR=/app/downloads
EXPOSE 3000

# Single process, single backend: the Go daemon serves both the API/WS and
# the static frontend. Data lives under /app/data (vytdl.db), downloads in
# /app/downloads — mount both as volumes.
CMD ["/app/vytdl", "serve", "--host", "0.0.0.0", "--port", "3000", "--static", "/app/out", "--home", "/app/data"]
