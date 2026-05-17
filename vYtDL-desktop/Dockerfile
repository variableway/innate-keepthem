# ── Stage 1: Build frontend ──
FROM node:20-slim AS frontend-builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

RUN pnpm install

COPY apps/desktop/ ./apps/desktop/
COPY packages/ ./packages/

RUN cd apps/desktop && pnpm build

# ── Stage 2: Build web server ──
FROM node:20-slim AS server-builder
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY web-server/package.json ./
RUN npm install

COPY web-server/ ./
RUN npm run build

# ── Stage 3: Build Go CLI ──
FROM golang:1.24-alpine AS cli-builder
WORKDIR /app

RUN apk add --no-cache git

COPY vYtDL/ /app/vYtDL/
WORKDIR /app/vYtDL
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) go build -ldflags="-s -w" -o vYtDL .

# ── Stage 4: Production ──
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY --from=frontend-builder /app/apps/desktop/out ./out

COPY --from=server-builder /app/dist ./server
COPY --from=server-builder /app/node_modules ./server/node_modules

COPY --from=cli-builder /app/vYtDL/vYtDL ./cli/vYtDL

RUN mkdir -p /app/data /app/downloads

ENV NODE_ENV=production
ENV VYTDL_DB_PATH=/app/data/vytdl.db
ENV VYTDL_OUTPUT_DIR=/app/downloads
ENV VYTDL_STATIC_DIR=/app/out
ENV VYTDL_CLI_PATH=/app/cli/vYtDL
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]
