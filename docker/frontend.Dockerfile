# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts

COPY frontend ./frontend
RUN npm run build --workspace @mailstrive/frontend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts --workspace @mailstrive/frontend --include-workspace-root \
    && npm cache clean --force

COPY --from=build /app/frontend/.next ./frontend/.next
COPY --from=build /app/frontend/public ./frontend/public
COPY frontend/next.config.mjs ./frontend/next.config.mjs

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/login || exit 1

CMD ["npm", "run", "start", "--workspace", "@mailstrive/frontend"]
