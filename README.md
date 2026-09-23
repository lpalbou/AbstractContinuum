# AbstractContinuum

Continuous iterative development and deployment console for AbstractFramework.

Connect it to a Run Gateway and it becomes the framework's development
cockpit (board-first, kanban/scrum-inspired — see
[docs/design/redesign_2026_07.md](docs/design/redesign_2026_07.md)):

- **Board** (landing page) — the work flow as a kanban: Triage → Ready →
  In Progress → In Review → Done, with a Failed history lane. Cards carry
  type / priority (P0–P3) / labels (sprints ride the `sprint-N` label
  convention) / package chips and a Definition-of-Ready dot; the card
  drawer holds the spec (view/edit + metadata), the item's runs, and the
  QA review (acceptance-criteria checklist → promote / iterate / UAT).
- **Executions** — the live ops view: queued / running / awaiting-QA
  requests with live log tails (cursor-follow), one-click QA actions, and
  a recently-finished strip.
- **Backlog** — the full catalog power view (all kinds incl. recurrent /
  deprecated / trash, search, batch execute, merge, AI assist + advisor).
- **Agents** — the workforce: the configured execution agent (executor is
  a pluggable seam — Codex CLI today), the advisor agent, and a track
  record from execution history.
- **Inbox** — triage bug reports, feature requests, and email; run triage
  and apply decisions.
- **Services** — control managed prod/UAT processes (start / stop /
  restart / redeploy) and write-only environment variables. This surface is
  high trust: see [SECURITY.md](SECURITY.md) before exposing it.
- **Settings** — gateway session sign-in (the shared abstractuic card) and
  AI preferences.

Executing a Ready item is gated by an advisory **Definition of Ready**
checklist (type, real summary, acceptance criteria, test commands — parsed
from the spec, override always available and labeled); promoting from
review shows the acceptance criteria as a **Definition of Done** checklist.

The observer app (`abstractobserver`) watches and discusses the running
system; this app develops and deploys it. See `history.md` for how the two
were split (2026-07-12), and [docs/README.md](docs/README.md) for the full
documentation set.

The pipeline is executor-agnostic by design: the gateway currently runs
executions through the Codex CLI, but the executing agent is a pluggable
seam and the UI reads the executor identity from the gateway's exec config
(see [docs/architecture.md](docs/architecture.md)).

## Run

> Requires a sibling `../abstractuic` checkout: `npm install`, `npm run
> build`, and `npm start` all resolve the shared UI kit and the session
> proxy from it (`file:` dependency + Vite aliases) until
> `@abstractframework/app-server` is published (tracked in
> `docs/backlog/planned/0001_publish_gated_app_server_dependency.md`).

```bash
npm install
npm run dev        # vite dev server on :3002 (proxies /api to :8080)
npm run build      # production build into dist/
npm start          # serve dist/ + the app-origin gateway session proxy
npm test           # vitest (unit + jsdom component tests)
```

Environment for `npm start`:

- `PORT` (default 3002), `HOST` (default 0.0.0.0)
- `ABSTRACTCONTINUUM_GATEWAY_URL` (or `ABSTRACTGATEWAY_URL`) — the gateway
  this deployment talks to (default `http://127.0.0.1:8080`)

Sign-in uses the gateway's session flow through the same-origin proxy
(first-party HttpOnly cookies + CSRF; tokens never appear in URLs). See
[docs/configuration.md](docs/configuration.md) for every knob and
[docs/getting-started.md](docs/getting-started.md) for a first session.

## Documentation

- [docs/README.md](docs/README.md) — documentation index
- [docs/getting-started.md](docs/getting-started.md) — first run and first execution
- [docs/architecture.md](docs/architecture.md) — components, data flow, design boundaries
- [docs/api.md](docs/api.md) — the gateway API families this app consumes
- [docs/configuration.md](docs/configuration.md) — environment variables and settings
- [docs/security.md](docs/security.md) — trust model (read before deploying)
- [docs/faq.md](docs/faq.md) / [docs/troubleshooting.md](docs/troubleshooting.md)
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow
