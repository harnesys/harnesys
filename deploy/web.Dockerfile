# ghcr.io/harnesys/web — SPA + /api reverse proxy to host.
# Build context is the repo root: `docker build -f deploy/web.Dockerfile .`

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
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY add-ons add-ons
COPY apps/webui/tsconfig.json apps/webui/tsconfig.server.json apps/webui/
COPY apps/webui/server apps/webui/server
COPY --from=client-build /app/apps/webui/dist /srv/dist

RUN bun install --frozen-lockfile

ENV HARNESYS_WEB_STATIC=/srv/dist \
    HARNESYS_UPSTREAM=http://host:47474 \
    HARNESYS_WEB_PORT=8080

EXPOSE 8080
CMD ["bun", "apps/webui/server/index.ts"]
