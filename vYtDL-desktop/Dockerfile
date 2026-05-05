# ── Stage 1: Build frontend ──
FROM node:20-slim AS frontend-builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config and package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies
RUN pnpm install

# Copy source code
COPY apps/desktop/ ./apps/desktop/
COPY packages/ ./packages/

# Build Next.js frontend (static export)
RUN cd apps/desktop && pnpm build

# ── Stage 2: Build web server ──
FROM node:20-slim AS server-builder
WORKDIR /app

# Install build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY web-server/package.json ./
RUN npm install

COPY web-server/ ./
RUN npm run build

# ── Stage 3: Production ──
FROM node:20-slim

# Install Python, pip, ffmpeg for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/apps/desktop/out ./out

# Copy built web server
COPY --from=server-builder /app/dist ./server
COPY --from=server-builder /app/node_modules ./server/node_modules

# Create data and downloads directories
RUN mkdir -p /app/data /app/downloads

ENV NODE_ENV=production
ENV VYTDL_DB_PATH=/app/data/vytdl.db
ENV VYTDL_OUTPUT_DIR=/app/downloads
ENV VYTDL_STATIC_DIR=/app/out
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]
