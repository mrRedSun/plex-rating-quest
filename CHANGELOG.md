# Changelog

## 4.0.7 - 2026-08-08

### Fixed

- Reflow footer utilities into a balanced mobile grid without clipped or collapsed controls.
- Restore spacing between the security disclosure and its icon-led trust features.

## 4.0.6 - 2026-08-08

### Added

- Add globally linked Privacy & Data Handling and Terms of Use pages for the public community deployment.
- Document operator contact, actual retention and security behavior, Plex and Cloudflare boundaries, family use, and legal-review assumptions.

### Changed

- Remove an unused third-party image preconnection from the application shell.

## 4.0.5 - 2026-08-08

### Changed

- Put Plex connection status, account identity, logout, and the primary action in an above-the-fold home command card.
- Prioritize the account card before marketing content on mobile screens.

## 4.0.4 - 2026-08-08

### Added

- Show a full-screen, accessible progress experience while restoring authentication or loading Plex data.
- Allow users to cancel in-flight Plex work without losing their authenticated account state.

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
