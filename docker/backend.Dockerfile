# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# OpenSSL is required by the Prisma query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Manifests first, so a source-only change reuses the cached install layer.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY shared ./shared
COPY backend ./backend
COPY worker ./worker

RUN npx prisma generate --schema prisma/schema.prisma
RUN npx tsc -b shared backend

# ---- Runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY prisma ./prisma
COPY examples ./examples

# Uploaded CSVs are archived here; mount a volume in production.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1

CMD ["node", "backend/dist/server.js"]
