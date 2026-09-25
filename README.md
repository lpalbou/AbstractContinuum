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
- **Agents & Entities** — the workforce: the configured execution agent
  (Codex CLI, Claude Code, Cursor Agent or AbstractCode — a gateway
  setting), the advisor agent, a
  track record from execution history, and gateway entities with their
  skills.
- **Team** — an [agora](docs/configuration.md#team-page-agora-hub) hub
  client for human + agent collaboration: channels and DMs with threaded
  messages, a unified inbox of open asks, hub-wide search, channel files,
  work claims, and live updates over WebSocket. It posts as one configured
  operator seat through a server-side proxy (the seat key never reaches the
  browser).
- **Inbox** — triage bug reports, feature requests, and email; run triage
  and apply decisions.
- **Services** — control managed prod/UAT processes (start / stop /
  restart / redeploy) and write-only environment variables. This surface is
  high trust: see [SECURITY.md](SECURITY.md) before exposing it.
- **Settings** — gateway sign-in, execution defaults (UAT or inplace), AI
  and voice preferences, and **Gateway administration**: the backlog
  folder, exec runner, executor and process manager, each shown with where
  its value comes from (launch flag, setting, environment (legacy), or
  default). Only a gateway admin can change them.

Executing a Ready item is gated by an advisory **Definition of Ready**
checklist (type, real summary, acceptance criteria, test commands — parsed
from the spec, override always available and labeled); promoting from
review shows the acceptance criteria as a **Definition of Done** checklist.

The observer app ([AbstractObserver](https://github.com/lpalbou/AbstractObserver))
watches and discusses the running system; this app develops and deploys it.
The pipeline is executor-agnostic: the gateway's `executor` setting picks
the agent that runs items (`codex` by default; also `claude`,
`cursor-agent`, `abstractcode`), and the UI reads the executor identity from
the gateway's exec config (see [docs/architecture.md](docs/architecture.md)).

## Install and run

Requirements:

- Node.js ≥ 18.
- **AbstractGateway 0.4.1 or newer** (the supported gateway; default
  `http://127.0.0.1:8080`). See
  [AbstractGateway](https://github.com/lpalbou/AbstractGateway). Against an
  older gateway the Board shows its *folder not available* panel.

```bash
npx @abstractframework/continuum
# or install the CLI globally
npm install -g @abstractframework/continuum
abstractcontinuum
```

Open `http://localhost:3002` and sign in with a gateway user and token (the
connection badge at the bottom of the sidebar). The token is exchanged
server-side for an HttpOnly session cookie and never stored in the browser.

The server is configured with launch flags or saved settings (full list in
[docs/configuration.md](docs/configuration.md), or `abstractcontinuum --help`):

```bash
abstractcontinuum --port 3002 --gateway-url http://127.0.0.1:8080 --hub-seat alice
abstractcontinuum config set hub_seat alice    # saved in ~/.abstractcontinuum/settings.json
abstractcontinuum config get                   # every setting and where it comes from
```

- `--port` (default `3002`), `--host` (default `127.0.0.1`)
- `--gateway-url` — the gateway this deployment talks to (default
  `http://127.0.0.1:8080`)
- `--hub-url` / `--hub-seat` / `--hub-token-file` — the agora hub, your seat
  and its key for the Team page. The hub seat is also on the Settings page.

A fresh gateway needs no backlog setup: it keeps its own backlog folder, and
the Board opens on **Your backlog is empty** with **Create your first item**.
To point the Board at a project, or to enable executions, see
[docs/getting-started.md](docs/getting-started.md#your-backlog).

Before exposing the console beyond localhost, read
[docs/security.md](docs/security.md): a signed-in user can redeploy services.

## Develop from source

The source build resolves the shared UI kit (`@abstractframework/ui-kit`,
`@abstractframework/panel-chat`) and the session proxy
(`@abstractframework/app-server`) from a sibling
[AbstractUIC](https://github.com/lpalbou/AbstractUIC) checkout:

```bash
git clone https://github.com/lpalbou/AbstractUIC.git abstractuic
git clone https://github.com/lpalbou/AbstractContinuum.git abstractcontinuum
cd abstractcontinuum
npm install
npm run dev        # vite dev server on :3002 (proxies /api to the gateway)
npm test           # vitest (unit + jsdom component tests)
npm run build      # production build into dist/
npm start          # serve dist/ + the app-origin gateway session proxy on :3002
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## Documentation

- [docs/README.md](docs/README.md) — documentation index
- [docs/getting-started.md](docs/getting-started.md) — first run and first execution
- [docs/architecture.md](docs/architecture.md) — components, data flow, design boundaries
- [docs/api.md](docs/api.md) — the gateway API families this app consumes
- [docs/configuration.md](docs/configuration.md) — server environment variables, gateway settings, browser settings
- [docs/conventions.md](docs/conventions.md) — the work-item grammar the Board reads
- [docs/security.md](docs/security.md) — trust model (read before deploying)
- [docs/faq.md](docs/faq.md) / [docs/troubleshooting.md](docs/troubleshooting.md)
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow

## License

MIT — see [LICENSE](LICENSE).
