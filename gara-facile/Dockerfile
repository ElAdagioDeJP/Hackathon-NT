# Gara Facile: Next.js app + SQLite (better-sqlite3). Runs on Node 22; bun only installs.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g bun@1.4.2

FROM base AS deps
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Some modules open the database at import time; build against a throwaway file.
RUN DB_FILE_NAME=/tmp/build.db node_modules/.bin/next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DB_FILE_NAME=/app/data/gara.db \
    FILES_STORAGE_PROVIDER=local \
    FILES_LOCAL_DIR=/app/var/uploads
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/data /app/var/uploads /app/var/evolus && chown -R node:node /app/data /app/var
USER node
EXPOSE 3000
CMD ["sh", "scripts/docker-start.sh"]
