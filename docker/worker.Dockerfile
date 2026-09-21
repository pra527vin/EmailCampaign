# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY shared ./shared
COPY worker ./worker

RUN npx prisma generate --schema prisma/schema.prisma
RUN npx tsc -b shared worker

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
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
COPY --from=build /app/worker/dist ./worker/dist
COPY prisma ./prisma

USER node

# SIGTERM reaches this directly (no shell form), which is what lets the worker
# finish in-flight sends before exiting.
CMD ["node", "worker/dist/index.js"]
