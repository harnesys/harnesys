# harnesys — single image: host API + SPA + /api proxy in one container.
# Build context is the repo root: `docker build -f deploy/unified.Dockerfile .`
#
# Runtime switch: HARNESYS_WEB_ENABLED=false runs the host API only (port 47474).
# Default runs both behind one port 8080 (see deploy/start.sh).

FROM oven/bun:1-alpine AS client-build
WORKDIR /app

# Workspace layout must be complete BEFORE bun install: bun snapshots each
# workspace into node_modules/.bun at install time (see host.Dockerfile).
COPY package.json bun.lock tsconfig.json ./
COPY packages/brix/package.json packages/brix/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/create-addon/package.json packages/create-addon/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY add-ons add-ons
COPY packages/brix packages/brix
COPY packages/contracts packages/contracts
COPY packages/sdk packages/sdk
COPY packages/studio-shared packages/studio-shared
COPY packages/harnesys packages/harnesys
COPY apps/webui apps/webui

RUN bun install --frozen-lockfile
RUN cd apps/webui && bun run build

FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.json ./
COPY packages/brix/package.json packages/brix/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/create-addon/package.json packages/create-addon/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY add-ons add-ons
COPY packages/brix packages/brix
COPY packages/contracts packages/contracts
COPY packages/sdk packages/sdk
COPY packages/studio-shared packages/studio-shared
COPY packages/harnesys packages/harnesys
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/assets apps/server/assets
COPY apps/server/src apps/server/src
COPY apps/webui/tsconfig.json apps/webui/tsconfig.server.json apps/webui/
COPY apps/webui/server apps/webui/server
COPY scripts scripts
COPY deploy/start.sh deploy/start.sh
COPY --from=client-build /app/apps/webui/dist /srv/dist

RUN bun install --frozen-lockfile
RUN bun run addon:build && bun run addon:payload build/assets/add-ons

ENV HARNESYS_HOME=/data \
    HARNESYS_ADDONS_DIR=/app/build/assets/add-ons \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=47474 \
    HARNESYS_WEB_PORT=8080 \
    HARNESYS_UPSTREAM=http://127.0.0.1:47474 \
    HARNESYS_WEB_STATIC=/srv/dist
VOLUME /data

HEALTHCHECK --interval=10s --timeout=5s --retries=6 --start-period=30s \
  CMD bun -e 'const web = process.env.HARNESYS_WEB_ENABLED !== "false"; const r = await fetch(web ? "http://127.0.0.1:8080/healthz" : "http://127.0.0.1:47474/health/live"); process.exit(r.ok ? 0 : 1)'

EXPOSE 47474 8080
CMD ["sh", "deploy/start.sh"]
