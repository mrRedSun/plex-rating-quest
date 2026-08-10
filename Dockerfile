# syntax=docker/dockerfile:1.7
FROM node:26.7.0-alpine3.23@sha256:ce3cc39fe3b8b2602d3b1c4d63d301e46b48c550ecb627869853ddcdda418b63 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund

COPY index.html tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts ./
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY server ./server
COPY src ./src
COPY store ./store
RUN npm run build

FROM node:26.7.0-alpine3.23@sha256:ce3cc39fe3b8b2602d3b1c4d63d301e46b48c550ecb627869853ddcdda418b63 AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:26.7.0-alpine3.23@sha256:ce3cc39fe3b8b2602d3b1c4d63d301e46b48c550ecb627869853ddcdda418b63 AS runtime
ARG APP_VERSION=development
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=8080 \
    DATA_DIRECTORY=/data \
    STATIC_DIRECTORY=/app/dist
WORKDIR /app
RUN addgroup -S -g 10001 quest && adduser -S -D -H -u 10001 -G quest quest \
    && mkdir -p /app/dist /data \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && chown -R quest:quest /app /data
COPY --from=build --chown=quest:quest /app/dist ./dist
COPY --from=build --chown=quest:quest /app/server-dist ./server-dist
COPY --from=production-dependencies --chown=quest:quest /app/node_modules ./node_modules

USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server-dist/server.js"]
