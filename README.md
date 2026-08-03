# Plex Rating Quest

A browser-only rating game for Plex libraries. Sign in through Plex PIN authentication, build a filtered quest, rate with keyboard or touch controls, review every pending change, and commit the batch only after explicit confirmation.

## Architecture

- `app/` — responsive React quest interface
- `lib/plex-client.ts` — typed Plex PIN, discovery, library, and rating API boundary
- `lib/diagnostics.ts` — bounded, structured, privacy-safe browser diagnostics
- `lib/quest.ts` — pure filtering, estimation, and statistics logic
- `store/quest-store.ts` — MobX domain store with device-local resume support
- `app/components/QuestUi.tsx` — shared, accessible interface primitives
- `deploy/nginx.conf` — hardened static server, caching, compression, and safe access logs
- `Dockerfile` — used only by GitHub Actions to produce the published image
- `compose.yaml` — pull-only production deployment; it never builds locally

The runtime container serves immutable static assets. It has no database and does not retain Plex credentials.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Use **Explore demo** to exercise the full flow without Plex.

## Agent deployment instructions

Docker Compose is the only supported deployment method. Deployment agents must pull the published GHCR image and must not run `docker build`, `docker compose build`, or publish an image themselves. No GPT Sites, Vercel, Netlify, or Cloudflare Pages deployment is used.

Use these steps exactly:

1. Verify Docker Engine and Docker Compose v2 are installed with `docker version` and `docker compose version`.
2. Clone or fast-forward the public repository.
3. Copy `.env.example` to `.env`. Keep the immutable image tag unless the user explicitly selects another published version or `sha-<commit>` tag.
4. Because the GHCR package is private by default, run `docker login ghcr.io` interactively with the GitHub username and a token having only `read:packages`. Never place that token in `.env`, Compose YAML, shell history, logs, or the repository.
5. Pull the prebuilt image, start it, and verify both Compose health and the HTTP health endpoint.

```bash
git clone https://github.com/mrRedSun/plex-rating-quest.git
cd plex-rating-quest
cp .env.example .env
docker login ghcr.io
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error http://127.0.0.1:8080/healthz
```

The expected health response is `ok`, and `docker compose ps` must report the service as healthy. If either check fails, inspect `docker compose logs --tail=200 plex-rating-quest` and do not claim deployment succeeded.

Open `http://YOUR_SERVER:8080`. To use another host port, edit `PLEX_RATING_PORT` in `.env`, then recreate the service:

```bash
docker compose up -d --remove-orphans
```

Successful `main` builds publish the exact scanned image to private GHCR with immutable `sha-<commit>` and `v<version>` tags plus a mutable `main` convenience alias. Production deployments must pin `PLEX_RATING_IMAGE` to an immutable version or SHA tag; do not deploy `main` as provenance.

For Plex authentication, put the container behind an HTTPS reverse proxy with a stable hostname. The app opens Plex authentication in a pop-up; allow pop-ups for the hostname. Plain HTTP is appropriate only for local demo testing.

### Operations

```bash
# Privacy-safe access and application-server errors
docker compose logs --tail=200 -f plex-rating-quest

# Upgrade to a user-approved published tag: edit PLEX_RATING_IMAGE in .env first
git pull --ff-only
docker compose pull
docker compose up -d --remove-orphans

# Health check
curl --fail http://127.0.0.1:8080/healthz

# Roll back: restore the previous immutable image tag in .env, then pull/recreate
docker compose pull
docker compose up -d --remove-orphans

# Stop without deleting images or unrelated Docker data
docker compose down
```

The application is stateless, so it has no Docker volumes to back up. Browser-local quest state belongs to each user’s device. Never run `docker compose down -v` against unrelated stacks.

## Diagnostics and logging

The container emits structured JSON access logs to stdout with method, path, status, byte count, duration, and request ID. Query strings, headers, referrers, user agents, tokens, and credentials are excluded.

The browser keeps a bounded session log of authentication milestones, Plex request operation names/statuses/timings, quest state transitions, batch progress, network changes, and runtime failures. Use the **Diagnostics** button to download a JSON report. Tokens, PINs, authorization headers, server addresses, media URLs, and credentials are redacted or never recorded.

When reporting a problem, include:

1. The downloaded diagnostics JSON.
2. `docker compose ps` output.
3. Relevant `docker compose logs` lines.
4. The browser name/version and whether pop-ups were allowed.

## Plex sign-in troubleshooting

- Serve the app over HTTPS and use the exact hostname throughout the session.
- Allow pop-ups; the app opens a blank window synchronously and navigates it after obtaining a PIN to avoid browser popup blocking.
- Ensure the browser can reach `plex.tv`, `app.plex.tv`, the selected Plex server, and its `plex.direct` address.
- Plex server certificates and CORS configuration must be valid for direct browser access.
- Download diagnostics immediately after a failure; no token is included.

Authentication follows Plex’s PIN flow. The access token exists only in live browser state and is sent directly to Plex/Plex Media Server endpoints. The container does not proxy, log, or store it.

## Quality and bundle controls

```bash
npm run check
```

Image construction, vulnerability scanning, and GHCR publication run only in GitHub Actions. Self-hosting agents consume the published artifact through `docker compose pull`.

The build uses production ES2022 output, minification, comment/debugger removal, CSS splitting, deterministic vendor chunks, no source maps, long-lived immutable asset caching, gzip transfer compression, and enforced gzip-size budgets. The browser must receive JavaScript to run the app, so minification cannot make frontend source impossible to inspect; no secret or privileged rule may rely on source concealment.

## Security notes

- The image is multi-stage and runs as an unprivileged user with a read-only filesystem, all Linux capabilities dropped, `no-new-privileges`, bounded CPU/memory/PIDs, explicit temporary storage, and a health check.
- Security headers include a restrictive CSP, frame denial, MIME sniffing protection, no-referrer behavior, and limited browser permissions.
- Dependency and base-image pins should be reviewed regularly. Test updates against a non-critical Plex library.
- Plex rating writes are sequential rather than transactionally atomic. A connection failure may produce a partially applied batch; failures are recorded so the remaining queue can continue.
