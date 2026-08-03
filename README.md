# Plex Rating Quest

A browser-only rating game for Plex libraries. Sign in through Plex PIN authentication, build a filtered quest, rate with keyboard or touch controls, review every pending change, and commit the batch only after explicit confirmation.

## Architecture

- `app/` — responsive React interface and quest state machine
- `lib/plex-client.ts` — typed boundary for Plex PIN, discovery, library, and rating APIs
- `lib/quest.ts` — pure filtering, estimation, and statistics logic
- `store/quest-store.ts` — Zustand session state with local resume support
- `tests/` — focused unit coverage for quest rules and statistics

The application has no backend. Session progress is saved in browser storage. Plex access tokens are kept only in live application state and are deliberately excluded from persisted quest data.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Use **Explore demo** to exercise the complete flow without a Plex account.

## Quality checks

```bash
npm run check
```

This runs zero-warning ESLint rules, strict TypeScript checking, Vitest coverage thresholds, and the production build. Individual commands are `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Plex configuration and behavior

No credentials or environment variables are required. The app generates a stable browser-local client identifier and uses Plex's hosted PIN authorization screen. A connected Plex Media Server must be reachable from the browser and permit cross-origin requests from the deployed origin.

Ratings use Plex's 10-point API values: each visible star maps to two points. Removing a rating queues the Plex removal value. The queue is processed sequentially after confirmation so individual failures can be counted without stopping remaining changes.

## Deployment

The build is Cloudflare Worker-compatible through Vinext and can also be adapted to a conventional static host. Sites deployment metadata lives in `.openai/hosting.json`. No secrets belong in source control.

Rollback is source-based: redeploy a previous immutable commit/version. Operational ownership includes checking Plex API compatibility, dependency advisories, and browser support before releases.

## Privacy and security notes

- The repository and deployment are private by default.
- Plex credentials are never collected; authentication happens on Plex.
- The access token is sent only to Plex and the selected Plex server.
- Artwork URLs may contain a server-scoped token because Plex servers require it; these URLs are not persisted by the app's resumable state.
- Browser-only architecture means a compromised browser extension or injected script could access live application state. Maintain a restrictive Content Security Policy at the hosting layer and keep dependencies current.
- Test against a non-critical Plex library before broad use. Plex API behavior is not transactionally atomic, so a connection failure may produce a partially applied batch; failures are surfaced for retry.
