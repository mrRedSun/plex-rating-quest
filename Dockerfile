# syntax=docker/dockerfile:1.7
FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts vitest.config.ts ./
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY store ./store
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.3-alpine3.24@sha256:a6c3ec0c0d249d68b0682df854d4a9e222b90fb607dc3fcf2f1d2fcbc85d347e AS runtime
COPY --chown=101:101 deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:8080/healthz"]
