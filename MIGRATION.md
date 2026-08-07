# Deployment-agent migration: v2 static container to v3 protected sessions

## Objective

Replace an existing Plex Rating Quest deployment with the published v3 container. This is a clean cutover, not an application-data migration. V3 adds a backend, an encrypted persistent session store, an HttpOnly cookie, and a Docker volume. Existing browser-side Plex tokens are deliberately discarded; sign in to Plex once after deployment.

Do not build the container. Do not delete Docker volumes, unrelated containers, Git history, or the existing `.env` backup.

## Preconditions

- Work in the existing repository checkout containing `compose.yaml`.
- Confirm the HTTPS reverse proxy routes the public hostname to this service and preserves `Host` or supplies `X-Forwarded-Host`.
- Confirm Docker Compose v2 is available.
- Record the currently deployed image for rollback:

```bash
docker compose images
docker compose ps
```

## Back up deployment configuration

Create a restrictive backup directory outside the repository and copy deployment configuration and any existing v3 secret into it:

```bash
backup_dir="$(mktemp -d /tmp/plex-rating-quest-migration.XXXXXX)"
chmod 700 "$backup_dir"
cp compose.yaml "$backup_dir/compose.yaml"
if [ -f .env ]; then cp .env "$backup_dir/.env"; chmod 600 "$backup_dir/.env"; fi
if [ -f secrets/session_secret ]; then mkdir -p "$backup_dir/secrets"; cp secrets/session_secret "$backup_dir/secrets/session_secret"; chmod 600 "$backup_dir/secrets/session_secret"; fi
echo "$backup_dir"
```

Retain the printed path until post-migration verification is complete.

## Upgrade

Fast-forward to the approved release and create `.env` if absent:

```bash
git pull --ff-only
if [ ! -f .env ]; then cp .env.example .env; fi
```

Set `PLEX_RATING_PUBLIC_ORIGIN` in `.env` to the exact externally visible HTTPS origin, without a trailing path. Example:

```bash
sed -i 's|^PLEX_RATING_PUBLIC_ORIGIN=.*|PLEX_RATING_PUBLIC_ORIGIN=https://plexquest.example.com|' .env
```

Replace the example hostname with the real deployment hostname before continuing.

Leave `PLEX_ALLOWED_PRIVATE_HOSTS` empty unless remote/relay Plex access is unavailable. For a direct LAN connection, set it to the exact Plex hostname or IP returned for your server, never an entire domain or subnet:

```bash
PLEX_ALLOWED_PRIVATE_HOSTS=192.168.1.20
```

Generate the Compose secret exactly once if it does not exist:

```bash
mkdir -p secrets
chmod 700 secrets
if [ ! -f secrets/session_secret ]; then
  umask 077
  openssl rand -hex 32 > secrets/session_secret
fi
chmod 600 .env secrets/session_secret
```

Validate Compose before changing the running service:

```bash
docker compose config --quiet
```

Pull the published image and recreate only this Compose project:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

Do not run `docker compose build`, `docker build`, `docker compose down -v`, `docker volume prune`, or `docker system prune`.

## Verify

```bash
docker compose ps
curl --fail --show-error http://127.0.0.1:${PLEX_RATING_PORT:-8080}/healthz
docker compose logs --tail=100 plex-rating-quest
docker volume inspect plex-rating-quest-data
```

Expected results:

- Service status is `healthy`.
- Health endpoint returns `ok`.
- Logs contain `server.started` and no configuration or session-decryption error.
- Named volume `plex-rating-quest-data` exists.
- Public HTTPS UI loads and displays `Protected session · self-hosted`.
- A test user can complete Plex PIN sign-in, return to the app, load data, reload the page, and remain signed in.
- Logout removes access; subsequent data loading requires another Plex sign-in.

## Roll back

Rollback preserves the v3 volume for a later retry. Restore the backed-up Compose file and environment, then recreate the service:

```bash
cp "$backup_dir/compose.yaml" compose.yaml
if [ -f "$backup_dir/.env" ]; then cp "$backup_dir/.env" .env; chmod 600 .env; fi
if [ -f "$backup_dir/secrets/session_secret" ]; then mkdir -p secrets; cp "$backup_dir/secrets/session_secret" secrets/session_secret; chmod 600 secrets/session_secret; fi
docker compose pull
docker compose up -d --remove-orphans
curl --fail --show-error http://127.0.0.1:${PLEX_RATING_PORT:-8080}/healthz
```

Do not delete `plex-rating-quest-data`; rollback does not need it, and retaining it keeps encrypted sessions recoverable when v3 is redeployed with the same secret.

## Operational ownership

- Back up `secrets/session_secret` and the `plex-rating-quest-data` volume through separate protected channels.
- Restore both together; encrypted sessions cannot be decrypted with a different secret.
- Never print, commit, upload, or include the secret or volume contents in diagnostics.
- Rotate the secret only after a suspected compromise. Rotation intentionally logs out every user; stop the service, archive or remove only the `sessions.enc` file from the named volume, replace `secrets/session_secret`, and restart.
