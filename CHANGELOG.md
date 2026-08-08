# Changelog

## 4.0.3 - 2026-08-08

### Changed

- Run Plex authorization in the current browser tab and resume the quest after Plex redirects back.

## 4.0.2 - 2026-08-08

### Fixed

- Restore backend Plex connectivity on Node.js 26 by returning the DNS result shape requested by Undici.
- Report the packaged application version in backend startup logs.
- Pin the Docker Compose deployment to the matching `v4.0.2` image.

## 4.0.1 - 2026-08-07

### Fixed

- Restore Plex sign-in by allowing the empty PIN request to reach the backend instead of being rejected as unsupported form data.
