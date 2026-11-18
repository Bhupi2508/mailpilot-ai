# MailPilot AI: single container. The API serves the built web UI on one port.
# Build: docker build -t mailpilot-ai .
# Run:   docker run -p 3400:3400 -v mailpilot-data:/data --env-file backend-node/.env mailpilot-ai

FROM node:20-bookworm-slim AS web
WORKDIR /app/web-ui
COPY web-ui/package.json web-ui/package-lock.json ./
RUN npm ci
COPY web-ui/ ./
RUN npm run build

FROM node:20-bookworm-slim AS api-deps
# Toolchain for compiling better-sqlite3 when no prebuilt binary matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend-node
COPY backend-node/package.json backend-node/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=3400 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web-ui/dist
WORKDIR /app/backend-node
COPY --from=api-deps /app/backend-node/node_modules ./node_modules
COPY backend-node/package.json ./
COPY backend-node/src ./src
COPY backend-node/scripts ./scripts
COPY --from=web /app/web-ui/dist /app/web-ui/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3400)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
