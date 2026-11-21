# ghcr.io/harnesys/host — host API on Bun.
# Build context is the repo root: `docker build -f deploy/host.Dockerfile .`
FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

# git + node/npm + curl are required at runtime: plugin/skill install clones
# repos (git), curated LSP installs run `npm i -g` (see
# infra/lsp/install-lsp-binary.ts), and the git credential helper fetches tokens
# with `curl` (infra/source/drivers/git/git-credential-helper.ts). Alpine's git
# pulls libcurl but not the curl CLI, so curl is installed explicitly.
RUN apk add --no-cache git nodejs npm curl

# Workspace layout must be complete BEFORE bun install: bun snapshots each
# workspace into node_modules/.bun at install time, so sources copied after
# install are invisible to resolution (add-ons fail with "Could not resolve
# @harnesys/sdk").
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
COPY scripts scripts

RUN bun install --frozen-lockfile

# Build the built-in add-ons and stage their runtime payload beside the host's
# assets; the host resolves it through HARNESYS_ADDONS_DIR (see
# docs/add-ons/packaging-lifecycle.md).
RUN bun run addon:build && bun run addon:payload build/assets/add-ons

ENV HARNESYS_HOME=/data
ENV HARNESYS_ADDONS_DIR=/app/build/assets/add-ons
# User-level state (git identity, bun/npm global packages, LSP binaries, node
# manager roots) must land on the /data volume to survive container replacement.
ENV HOME=/data
ENV NPM_CONFIG_PREFIX=/data/.npm-global
VOLUME /data

EXPOSE 47474
CMD ["bun", "apps/server/src/main.ts"]
