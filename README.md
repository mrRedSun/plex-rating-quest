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
- `Dockerfile` and `compose.yaml` — the only supported production hosting path

The runtime container serves immutable static assets. It has no database and does not retain Plex credentials.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Use **Explore demo** to exercise the full flow without Plex.

## Self-host with Docker Compose

Docker Compose is the primary and only supported deployment method. No GPT Sites, Vercel, Netlify, or Cloudflare Pages deployment is used.

```bash
git clone https://github.com/mrRedSun/plex-rating-quest.git
cd plex-rating-quest
docker compose build --pull
docker compose up -d
docker compose ps
```

Open `http://YOUR_SERVER:8080`. To use another host port:

```bash
PLEX_RATING_PORT=9090 docker compose up -d
```

For Plex authentication, put the container behind an HTTPS reverse proxy with a stable hostname. The app opens Plex authentication in a pop-up; allow pop-ups for the hostname. Plain HTTP is appropriate only for local demo testing.

### Operations

```bash
# Privacy-safe access and application-server errors
docker compose logs --tail=200 -f plex-rating-quest

# Upgrade and recreate without downtime-sensitive state or volumes
git pull --ff-only
docker compose build --pull
docker compose up -d --remove-orphans

# Health check
curl --fail http://127.0.0.1:8080/healthz

# Roll back to a known commit
git checkout <known-good-commit>
docker compose build
docker compose up -d

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
docker compose build
```

The build uses production ES2022 output, minification, comment/debugger removal, CSS splitting, deterministic vendor chunks, no source maps, long-lived immutable asset caching, gzip transfer compression, and enforced gzip-size budgets. The browser must receive JavaScript to run the app, so minification cannot make frontend source impossible to inspect; no secret or privileged rule may rely on source concealment.

## Security notes

- The image is multi-stage and runs as an unprivileged user with a read-only filesystem, all Linux capabilities dropped, `no-new-privileges`, bounded CPU/memory/PIDs, explicit temporary storage, and a health check.
- Security headers include a restrictive CSP, frame denial, MIME sniffing protection, no-referrer behavior, and limited browser permissions.
- Dependency and base-image pins should be reviewed regularly. Test updates against a non-critical Plex library.
- Plex rating writes are sequential rather than transactionally atomic. A connection failure may produce a partially applied batch; failures are recorded so the remaining queue can continue.
