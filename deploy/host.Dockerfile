# ghcr.io/harnesys/host — host API on Bun.
# Build context is the repo root: `docker build -f deploy/host.Dockerfile .`
FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.json ./
COPY packages/brix/package.json packages/brix/
COPY packages/contracts/package.json packages/contracts/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/sdk/package.json packages/sdk/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY add-ons add-ons
RUN bun install --frozen-lockfile

# Bun needs tsconfig experimentalDecorators/emitDecoratorMetadata for DI.
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/assets apps/server/assets
COPY apps/server/src apps/server/src
COPY packages/brix packages/brix
COPY packages/contracts packages/contracts
COPY packages/studio-shared packages/studio-shared
COPY packages/harnesys packages/harnesys
COPY packages/sdk packages/sdk
COPY scripts scripts

# Build the built-in add-ons and stage their runtime payload beside the host's
# assets; the host resolves it through HARNESYS_ADDONS_DIR (see
# docs/add-ons/packaging-lifecycle.md).
RUN bun run addon:build && bun run addon:payload build/assets/add-ons

ENV HARNESYS_HOME=/data
ENV HARNESYS_ADDONS_DIR=/app/build/assets/add-ons
VOLUME /data

EXPOSE 47474
CMD ["bun", "apps/server/src/main.ts"]
