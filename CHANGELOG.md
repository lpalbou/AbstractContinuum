# Changelog

All notable, user-visible changes to AbstractContinuum.

## Unreleased

## 0.3.1 — 2026-09-25

**Compatibility:** same as 0.3.0 (AbstractGateway 0.4.1 or newer). No
action is needed unless you relied on the Team page's old personal hub-seat
default: set your seat once — on the Settings page (Settings → Team (agora
hub) → Hub seat), with `abstractcontinuum config set hub_seat <seat>`, or
with `--hub-seat <seat>` for one run. Environment variables you already use
keep working as a legacy fallback.

### Changed

- **Continuum's server is configured with launch flags or
  `abstractcontinuum config`.** Every server setting has a flag (`--port`,
  `--host`, `--gateway-url`, `--hub-url`, `--hub-seat`, `--hub-token-file`,
  `--hub-allow-remote`, the sign-in proxy settings, …) and a saved setting
  in `~/.abstractcontinuum/settings.json`, written with
  `abstractcontinuum config set <setting> <value>` (`config get` shows every
  value and where it comes from). The file is owner-only because it can
  hold the hub token. Environment variables remain a legacy fallback.
- **The hub seat is a setting on the Settings page** (Settings → Team
  (agora hub) → Hub seat). It is saved on the Continuum server, survives
  restarts and applies to the Team page at once. You can also run
  `abstractcontinuum config set hub_seat <seat>`, or pass `--hub-seat` for
  one run.
- The Team page's hub seat defaults to `operator` instead of a personal
  name. If you used the Team page without choosing a seat, set yours as
  above.
- `abstractcontinuum --help` lists every flag with its default and its
  setting name.
- `npm run dev` serves on port 3002 (Continuum's port on the stack map),
  reads the same settings file, and proxies `/api` to the configured
  gateway.

## 0.3.0 — 2026-09-24

**Compatibility:** needs AbstractGateway 0.4.1 or newer
(`GET /api/gateway/backlog/status` and the gateway settings door). Against an
older gateway the Board shows the *folder not available* panel.

### Changed

- **A fresh gateway shows an empty Board, not a setup box.** The gateway
  keeps its own backlog folder by default, so the Board opens on **Your
  backlog is empty** with the folder path, a Copy button and **Create your
  first item** (the New task modal). The "Backlog browsing is not
  configured … set ABSTRACTGATEWAY_TRIAGE_REPO_ROOT" callout is gone.
- **Folder not available** (a saved folder that was deleted, or a gateway
  older than the setting): the Board, Backlog and Executions pages show the
  folder and the gateway's reason; an admin gets **Use the gateway's own
  folder** and **Choose a folder…** (validated by the gateway, its refusal
  shown as is); others are told to ask the gateway admin and where.
- **Settings → Gateway administration** names each setting's source in words
  (launch flag / setting / environment (legacy) / default), renders the
  gateway's own label and help, adds **Use the gateway's own folder**, and
  reads a vanished folder as *not available* with its reason.
- **No environment-variable instructions in the app or its docs**: the
  Executions, Execute dialog, UAT and Services hints name the gateway setting
  and the `abstractgateway config set …` line instead.
- **Migration:** a gateway configured through environment variables keeps
  working; Settings shows those values as *environment (legacy)*, and saving
  a value there replaces them.

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
