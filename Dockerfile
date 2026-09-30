# Stage 1: Install dependencies and build the web app
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/ apps/
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @weather/web build

# Stage 2: Production runtime
FROM node:22-alpine AS production

RUN addgroup -g 1001 weather && \
    adduser -u 1001 -G weather -s /bin/sh -D weather && \
    mkdir /data && chown weather:weather /data

WORKDIR /app

COPY --from=builder --chown=weather:weather /app/node_modules ./node_modules
COPY --from=builder --chown=weather:weather /app/apps ./apps
COPY --from=builder --chown=weather:weather /app/packages ./packages
COPY --from=builder --chown=weather:weather /app/package.json ./package.json
COPY --from=builder --chown=weather:weather /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=weather:weather migrations ./migrations

# The workspace packages are TypeScript sources, so run them through tsx.
# The API applies database migrations on start and serves the web app too.
ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/apps/web/dist \
    DATABASE_PATH=/data/weather.db

USER weather
WORKDIR /app/apps/api
EXPOSE 1456

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:1456/health/live || exit 1

CMD ["node", "--import", "tsx", "src/main.ts"]
