# syntax=docker/dockerfile:1.7
FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS build
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

FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS runtime
ENV NODE_ENV=production \
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

USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server-dist/server.js"]
