# Changelog

All notable, user-visible changes to AbstractContinuum.

## 0.2.0 — 2026-09-23 — first public release

First release published to npm as `@abstractframework/continuum`. Run it
with `npx @abstractframework/continuum` (CLI: `abstractcontinuum`).

AbstractContinuum is the AbstractFramework development and deployment
console: a thin React client over a Run Gateway's development-lane APIs,
served by a small Node server that holds the gateway session.

### Added

- **Board** (landing page) — kanban work flow (Triage → Ready → In Progress
  → In Review → Done, plus a Failed history lane) derived from gateway state.
  Cards carry type, priority (P0–P3), labels (sprints via `sprint-N`),
  package chips, and a Definition-of-Ready indicator; the card drawer holds
  the spec (view/edit + metadata), the item's runs, and the QA review
  (acceptance-criteria checklist → promote / iterate / deploy to UAT).
  Hub-backed cards show their work claims and activity.
- **Executions** — live view of queued / running / awaiting-QA exec
  requests with cursor-following log tails, one-click QA actions, and a
  recently-finished strip.
- **Backlog** — catalog view over every kind (planned, proposed, recurrent,
  completed, deprecated, trash) with search, batch execute, merge, guided
  item creation from the gateway template, AI assist, and a read-only
  advisor with voice input and spoken replies.
- **Agents & Entities** — the configured executor (Codex CLI today; the
  executor is read from the gateway's exec config), the advisor agent, a
  track record folded from execution history, and gateway entities with
  their skills.
- **Team** — an agora hub client: channels and DMs with threaded messages,
  reactions and retraction, an inbox of open asks, hub-wide grouped search
  (with semantic-search mode and coverage when the hub serves it), channel
  files with markdown and Mermaid rendering, work claims, ledger
  verification, and live updates over WebSocket. It posts as one operator
  seat configured on the server.
- **Inbox** — bug report, feature request, and email triage with decisions.
- **Services** — managed prod/UAT process control (start / stop / restart /
  redeploy) and write-only environment variables.
- **Settings** — gateway sign-in through the shared connection dialog, AI
  provider/model and reasoning-effort preferences, and per-browser voice
  overrides.
- **Server** (`abstractcontinuum`, `bin/cli.js`) — serves the built app and
  proxies `/api/*` through the `@abstractframework/app-server` session proxy
  (first-party HttpOnly cookies + CSRF; tokens never stored in the browser),
  plus an allowlisted agora hub proxy under `/api/hub/*` that attaches the
  seat key server-side. Sends a Content-Security-Policy on the app document.
  `--help` and `--version` flags.

### Security

- The server binds loopback (`127.0.0.1`) by default; wider binds are an
  explicit `HOST` choice. The hub proxy refuses non-loopback peers unless
  `ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE=1` and rejects cross-origin browser
  requests, including WebSocket handshakes. See `docs/security.md`.

### Compatibility

- Requires Node.js ≥ 18 and a Run Gateway (`abstractgateway`) that serves
  the development-lane API families listed in `docs/api.md`. Features the
  gateway has not enabled (exec runner, process manager, backlog browsing)
  render with the gateway setting that enables them.
- The Team page's hub contract is typed and tested against the vendored
  hub OpenAPI artifact in `vendor/hub/`.
