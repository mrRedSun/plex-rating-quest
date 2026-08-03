# Plex Rating Quest

Turn a large Plex library into a fast rating game. Connect through Plex, filter the titles you have watched, rate with keyboard or touch controls, review the batch, and decide when changes are sent to Plex.

## Features

- Official Plex PIN sign-in
- Movie and show library discovery
- Watched, unrated, movie, show, year, genre, library, and play-count filters
- Keyboard-first rating with a resumable local queue
- Review and confirmation before Plex is updated
- Watched-show tier lists with persistent S–D rankings
- Privacy-safe PNG and AI-ready Markdown tier-list exports
- Privacy-safe downloadable diagnostics
- Responsive interface with reduced-motion support
- Self-hosted, pull-only Docker Compose deployment

The app is browser-only. The container serves static files and never receives or stores Plex credentials.

## Install with Docker Compose

Requirements:

- Docker Engine with Docker Compose v2
- A GitHub token with `read:packages` for the private GHCR image
- HTTPS with a stable hostname for reliable Plex authentication

Clone the repository:

```bash
git clone https://github.com/mrRedSun/plex-rating-quest.git
cd plex-rating-quest
cp .env.example .env
```

Sign in to GHCR interactively. Use your GitHub username and a token limited to `read:packages`:

```bash
docker login ghcr.io
```

Pull and start the published image:

```bash
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error http://127.0.0.1:8080/healthz
```

The health endpoint must return `ok`, and `docker compose ps` must show the service as healthy. Open `http://YOUR_SERVER:8080`, or expose it through your HTTPS reverse proxy.

Deployment agents must use `docker compose pull`. Do not run `docker build` or `docker compose build` on the deployment host.

## Configuration

Edit `.env` before starting the service:

| Variable            | Default                                     | Purpose                             |
| ------------------- | ------------------------------------------- | ----------------------------------- |
| `PLEX_RATING_IMAGE` | `ghcr.io/mrredsun/plex-rating-quest:v1.1.0` | Immutable published image tag       |
| `PLEX_RATING_PORT`  | `8080`                                      | Host port mapped to the application |

Prefer a `v<version>` or `sha-<commit>` image tag. The mutable `main` tag is available for testing but should not be used as production provenance.

## Operations

View logs:

```bash
docker compose logs --tail=200 -f plex-rating-quest
```

Upgrade to a published version:

1. Change `PLEX_RATING_IMAGE` in `.env` to the approved immutable tag.
2. Pull and recreate the service.

```bash
git pull --ff-only
docker compose pull
docker compose up -d --remove-orphans
curl --fail --show-error http://127.0.0.1:8080/healthz
```

Roll back by restoring the previous image tag in `.env`, then run the same `docker compose pull` and `docker compose up -d --remove-orphans` commands.

Stop the application without deleting images or unrelated Docker data:

```bash
docker compose down
```

The application has no Docker volumes. Quest progress is stored in each browser's local storage.

## Plex sign-in

- Serve the app through HTTPS with one stable hostname.
- Allow pop-ups for that hostname.
- The browser must reach `plex.tv`, `app.plex.tv`, and the selected Plex server.
- Plex server certificates and browser CORS access must be valid.
- Use the in-app **Diagnostics** download after a failure; tokens and server addresses are excluded.

## Development

Requires Node.js 22.13 or newer:

```bash
npm ci
npm run dev
```

Run the complete local quality suite with:

```bash
npm run check
```

GitHub Actions runs formatting, strict linting, type checking, tests, dependency audit, production bundling, image construction, and high/critical vulnerability scanning. Successful `main` runs publish the scanned image to GHCR with version, commit-SHA, and `main` tags.
