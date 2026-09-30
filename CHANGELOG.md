# Changelog

All notable, user-visible changes to AbstractContinuum.

## [Unreleased]

### Fixed

- **Plain http from another machine** (LAN, Tailscale). Browsers withhold
  `crypto.randomUUID`, `crypto.subtle`, the clipboard API and the microphone
  outside https and localhost. Ids now come from the kit's `randomId()`, the
  backlog and ledger hashes use a plain SHA-256 when `crypto.subtle` is
  missing (same hashes), **Copy** on a process log falls back to a text
  selection copy and says "Copied" or "Copy failed — select and copy", and
  the advisor's voice control says "Voice and camera need an https address
  (Network → HTTPS in the gateway console)." Needs `@abstractframework/ui-kit`
  0.3.3.

## 0.5.0 — 2026-09-30

Continuum adapts to the screen: desktop windows of any size, tablets and
phones, in portrait and landscape. Everyone using the web console is
affected; nothing changes in the server, its flags or the gateway it needs
(AbstractGateway 0.4.1 or newer standalone, 0.7.0 or newer under
`/apps/continuum/`). Desktop windows 1440 px and wider keep their layout.
See [Responsive layout](README.md#responsive-layout).

### Added

- **Menu drawer below 1024 px.** On tablets and narrow windows the sidebar
  becomes a menu opened from the header button; Escape, a tap outside or
  **Close menu** closes it, and the page behind it is inactive while it is
  open.
- **Team page, one pane at a time on phones.** Pick a channel to open its
  thread and use **← Channels** to return. The thread keeps the screen: one
  bar holds **← Channels**, the channel name and **More**, which shows the
  filters, search, sort, channel actions and the Assistant / Members / Files /
  Leaderboard / Desk panels. The message box takes the width and Send is an
  icon button. Short landscape windows use the same layout.
- **List, then detail on phones** for Executions and the Inbox (reports and
  email), with **← Back to the list**.
- **Backlog cards on phones**: one card per item, title first, actions
  underneath.

### Changed

- **Team page on laptops and tablets (768 to 1439 px):** an open panel sits
  beside the thread and the channel list steps aside; from 1440 px channels,
  thread and panel stay side by side. The filter bar wraps onto a second row
  when the thread column is narrow.
- **Dialogs are sheets on phones** and in short landscape windows (New task,
  Execute, the file viewer): they open from the bottom of the screen with an
  opaque surface, their buttons stay visible and they rise above the on-screen
  keyboard. The work-item drawer is full width on phones.
- **Escape** closes the top dialog or drawer only. In the work-item drawer it
  does nothing while you are typing or editing the spec.
- **Touch screens:** buttons, rows, tabs and checkboxes are at least 44 px,
  form fields use 16 px text (no zoom on focus), and messages, reports, specs
  and form labels use the 14 px reading size. Message actions sit under the
  message.
- **The header always fits:** the page title shortens with an ellipsis and on
  phones **+ New task** shows as **+**.
- **Wide windows:** board lanes use the full width from 1440 px; messages and
  documents keep a readable line length. The backlog table's optional columns
  (labels, package) follow the width of the table.
- Uses `@abstractframework/ui-kit` 0.3.2 and `@abstractframework/panel-chat`
  0.2.1.
- A source checkout builds on its own: the UI kit comes from npm, no sibling
  AbstractUIC checkout is needed.

## 0.4.0 — 2026-09-28

Serving Continuum through the gateway at `/apps/continuum/` needs
AbstractGateway 0.7.0 or newer. Standalone use on Continuum's own port works
with AbstractGateway 0.4.1 or newer, as before. The server keeps listening on
`127.0.0.1` by default.

### Added

- **Served through the gateway at `/apps/continuum/`.** A gateway that
  manages Continuum opens it on the gateway's own address, so a remote or
  headless machine needs one port and one tunnel for the console and every
  app. Every response announces `X-AbstractFramework-App: continuum; mount=1`
  (the WebSocket `101` too); the page is served with its `<base href>` and
  `base_path`; cookies carry `Path=/apps/continuum/`. Standalone at `/` on
  Continuum's own port works as before.
- `--gateway` and `--url` are accepted as aliases of `--gateway-url`, the
  spelling shared by every AbstractFramework app.
- With no flag, setting or environment variable naming a gateway, Continuum
  uses the gateway installed on this computer
  (`~/.abstractframework/gateway.json`, reported as *the gateway installed on
  this computer*) and follows it to a new port while running.

### Changed

- Every request the page makes is relative to the page (`api/gateway/…`,
  `api/hub/…`, `api/continuum/settings`), and the build uses relative asset
  URLs. `npm run build` fails on a root-absolute same-origin URL in `dist/`.
- The Team page's hub proxy, its WebSocket relay and the Settings route judge
  the browser's address as the gateway reports it: opened through the gateway
  from another machine, they refuse the browser unless Continuum runs with
  `--hub-allow-remote`. The Origin check compares with the host the browser
  addressed. A malformed forwarded header is refused with `400`.
- The app document's CSP admits the one configuration script the server
  injects, by its hash.
- A markdown link or image in a hub message that targets a root-absolute
  `/api/…` address is shown as a blocked link (behind the gateway it would
  reach the gateway's own API); hub attachment images embed through the
  relative `api/hub/…` address.
- Requires `@abstractframework/app-server` 0.1.11 or newer (the mount kit)
  and is built against `@abstractframework/ui-kit` 0.1.14 (`joinBaseUrl` /
  `GATEWAY_CONNECTION_PATH`).
- **Team AI features read up to 50,000 tokens of the conversation (ADR-0026).**
  *Summarize* and the channel assistant used to send at most 24,000 characters
  of transcript: the oldest messages were dropped and any message longer than
  12,000 characters was cut. The transcript is now the newest whole messages
  up to 50,000 estimated tokens (the same history window as AbstractRuntime),
  and no message is ever cut. The transcript's first line tells the model how
  many messages it holds; when older messages are dropped, a labeled
  `#TRUNCATION` line gives the count. The summary header and the assistant
  drawer show what the model read, for example
  "38 of 40 messages (2 oldest dropped by the 50,000-token history window)".
- **Backlog advisor attachments are sent whole.** Attached files were limited
  to the first 6 files and 20,000 characters each. Every picked file is now
  inlined in full into the composer, where you can see it before you send.

### Security

- With `@abstractframework/app-server` 0.1.11 or newer, a request counts as
  coming from this computer only when both its connection address and the
  host name the browser addressed are loopback, so a page served from another
  site under a name that resolves to `127.0.0.1` is treated as remote.

## 0.3.2 — 2026-09-26

### Added

- **About AbstractContinuum.** The (i) button in the top-right cluster opens
  the AbstractFramework About dialog: the Continuum version you are running,
  the author and licence, links to the website, source, documentation,
  issue tracker and feedback, and the versions your gateway reports
  (AbstractGateway, AbstractFramework and its packages). If the gateway
  cannot say, the dialog shows why ("Gateway: unavailable (HTTP 401: …)").
  Needs AbstractGateway with the public `GET /about` route for the gateway
  rows.

### Changed

- Requires `@abstractframework/app-server` 0.1.10 or newer (was 0.1.9), so the
  forwarding-header protection below is always present.
- `package.json` `homepage` points to https://abstractframework.ai and a
  `bugs` URL is set, both from the shared AbstractFramework descriptor.

### Security

- With `@abstractframework/app-server` 0.1.10 or newer, the sign-in proxy
  sends the browser's connection address as `X-Forwarded-For` (browser-supplied
  forwarding headers are dropped) and the marker
  `X-AbstractFramework-App-Proxy: abstractcontinuum` on every gateway-bound
  request; a connection whose address is unknown is refused with HTTP 400.

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
