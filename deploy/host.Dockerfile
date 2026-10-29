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
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
RUN bun install --frozen-lockfile

# Bun needs tsconfig experimentalDecorators/emitDecoratorMetadata for DI.
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/assets apps/server/assets
COPY apps/server/src apps/server/src
COPY packages/brix packages/brix
COPY packages/contracts packages/contracts
COPY packages/studio-shared packages/studio-shared
COPY packages/harnesys packages/harnesys

ENV HARNESYS_HOME=/data
VOLUME /data

EXPOSE 47474
CMD ["bun", "apps/server/src/main.ts"]
