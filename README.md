# Plex Rating Quest

Plex Rating Quest turns your Plex watch history into a fast rating game, ratings dashboard, and exportable show tier list. It supports English and Ukrainian, touch and keyboard controls, review-before-write rating batches, Markdown exports for recommendation agents, and privacy-safe diagnostics.

## Privacy model

The application is self-hosted but no longer browser-only. Its container serves the interface and acts as a narrow Plex gateway:

- Plex PIN authorization and Plex API requests are handled by the container.
- Plex account and server tokens are never returned to browser JavaScript or placed in artwork URLs.
- The browser receives a random `Secure`, `HttpOnly`, `SameSite=Lax` session cookie.
- Session records are AES-256-GCM encrypted in the `plex-rating-quest-data` Docker volume.
- The Compose-mounted `secrets/session_secret` file is the encryption key material. Losing it invalidates stored sessions; exposing it compromises them.
- Ratings are sent to Plex only after the user confirms the batch.
- Quest progress, filters, viewing titles/dates, ratings, and tier lists remain only in the current tab's session storage and are cleared when the tab session ends or logout succeeds.

The container can reach Plex account services and the Plex server connections returned by Plex. Operators are responsible for protecting the host, volume, encryption secret, TLS reverse proxy, and network path.

## Backend architecture

The backend uses small native Node modules with explicit boundaries:

- `api-router` owns the same-origin HTTP contract and authorization gates.
- `plex-gateway` owns Plex protocol details, upstream timeouts, and token injection.
- `session-repository` owns encrypted persistence and HttpOnly cookies.
- `config`, `http`, `static-files`, and `logger` isolate runtime concerns.
- `server` is only the composition root and graceful lifecycle.

These boundaries allow the encrypted file repository to be replaced by another storage adapter, or new Plex capabilities to be added, without changing browser authentication or deployment shape.

## Install with Docker Compose

Requirements: Docker Engine, Docker Compose v2, a stable HTTPS hostname, and access to the public GHCR image.

```bash
git clone https://github.com/mrRedSun/plex-rating-quest.git
cd plex-rating-quest
cp .env.example .env
```

Generate the persistent session-encryption secret once as a protected Compose secret:

```bash
mkdir -p secrets
chmod 700 secrets
umask 077
openssl rand -hex 32 > secrets/session_secret
```

Protect the file, pull the published image, and start it:

```bash
chmod 600 .env secrets/session_secret
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error http://127.0.0.1:8080/healthz
```

The health endpoint must return `ok` and Compose must report the service as healthy. Publish port 8080 only through an HTTPS reverse proxy. Preserve the original `Host` header and set `X-Forwarded-Host`; do not expose the app over plain HTTP because secure session cookies will not work.

Deployment agents must use the published image with `docker compose pull`. They must not build an image on the deployment host.

## Configuration

| Variable                          | Required | Default                    | Purpose                                                                      |
| --------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------- |
| `PLEX_RATING_SESSION_SECRET_FILE` | No       | `./secrets/session_secret` | Host path to the Compose-mounted encryption secret                           |
| `PLEX_RATING_PORT`                | No       | `8080`                     | Host port bound to the application                                           |
| `PLEX_RATING_PUBLIC_ORIGIN`       | Yes      | none                       | Exact public HTTPS origin used for CSRF validation                           |
| `PLEX_ALLOWED_PRIVATE_HOSTS`      | No       | empty                      | Exact comma-separated Plex hosts allowed to resolve to private/LAN addresses |

Never rotate `secrets/session_secret` as part of a routine upgrade. Back up the secret separately from the encrypted volume and restrict both to the deployment operator.

Private, loopback, link-local, multicast, and metadata destinations are denied by default. If the container must connect directly to a LAN Plex address, add only that exact IP address or hostname to `PLEX_ALLOWED_PRIVATE_HOSTS`; prefer Plex's remote or relay HTTPS connection when possible.

## Upgrade and rollback

```bash
git pull --ff-only
docker compose pull
docker compose up -d --remove-orphans
curl --fail --show-error http://127.0.0.1:8080/healthz
```

To roll back, restore the previous pinned `image:` value in `compose.yaml`, then repeat `docker compose pull` and `docker compose up -d --remove-orphans`. Do not delete the named volume. See [MIGRATION.md](MIGRATION.md) for the v2 static-container migration, exact backup procedure, verification, and rollback.

Stop without deleting sessions:

```bash
docker compose down
```

View privacy-safe structured logs:

```bash
docker compose logs --tail=200 -f plex-rating-quest
```

## Development

Requires Node.js 26.5.1 or newer:

```bash
npm ci
npm run check
```

For interactive development, run the backend and Vite in separate terminals:

```bash
SESSION_SECRET="development-only-secret-at-least-32-characters" npm run dev:server
```

```bash
npm run dev
```

GitHub Actions runs formatting, strict linting, type checking, tests, dependency auditing, the production build, container construction, and high/critical vulnerability scanning. Successful `main` builds publish version, commit-SHA, and `main` tags to GHCR.
