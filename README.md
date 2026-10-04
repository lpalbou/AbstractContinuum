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

The **(i) About** button in the top-right cluster opens the shared
AbstractFramework About card: the Continuum version, the AbstractFramework and
AbstractGateway versions your gateway reports, the project links and the
licence line; see [docs/faq.md](docs/faq.md).

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
connection badge at the bottom of the sidebar). When your gateway manages
Continuum (the gateway console's **Apps** screen), open it from there
instead: the gateway serves it at `/apps/continuum/` on its own port, so a
remote or headless machine needs one port and one tunnel for the console and
every app. The token is exchanged
server-side for an HttpOnly session cookie and never stored in the browser.

The server is configured with launch flags or saved settings (full list in
[docs/configuration.md](docs/configuration.md), or `abstractcontinuum --help`):

```bash
abstractcontinuum --port 3002 --gateway-url http://127.0.0.1:8080 --hub-seat alice
abstractcontinuum config set hub_seat alice    # saved in ~/.abstractcontinuum/settings.json
abstractcontinuum config get                   # every setting and where it comes from
```

- `--port` (default `3002`), `--host` (default `127.0.0.1`)
- `--gateway-url` (aliases `--gateway`, `--url`) — the gateway this
  deployment talks to (default: the gateway installed on this computer, from
  `~/.abstractframework/gateway.json`, else `http://127.0.0.1:8080`)
- `--hub-url` / `--hub-seat` / `--hub-token-file` — the agora hub, your seat
  and its key for the Team page. The hub seat is also on the Settings page.

A fresh gateway needs no backlog setup: it keeps its own backlog folder, and
the Board opens on **Your backlog is empty** with **Create your first item**.
To point the Board at a project, or to enable executions, see
[docs/getting-started.md](docs/getting-started.md#your-backlog).

Before exposing the console beyond localhost, read
[docs/security.md](docs/security.md): a signed-in user can redeploy services.

## Responsive layout

Continuum works in a desktop window of any size, on a tablet and on a phone,
in portrait and landscape. The layout follows the window as you resize it.

| Window width | Layout |
| --- | --- |
| 1440 px and wider | Sidebar docked; the Team page shows channels, thread and an open panel side by side; board lanes use the full width |
| 1024 to 1439 px | Sidebar docked; on the Team page an open panel (Members, Files, …) sits beside the thread and the channel list steps aside |
| 768 to 1023 px (tablets, narrow windows) | The sidebar becomes a menu: open it with the button at the left of the header; the Team page shows one pane at a time; Executions and the Inbox keep the list (at least 360 px) beside the detail |
| Below 768 px (phones) | Lists and details use the full width as flat sections in one scrolling page: the list sits above the selected item, and picking an item scrolls to it; the Team page shows one pane at a time |

Every list next to a detail (the Board columns, Executions' **Active** and
**Recently finished**, the Inbox lists) has a chevron in its header: close it
to give the detail the room. Each list remembers its state in this browser.

On phones and in short landscape windows:

- **Team**: the thread keeps the screen, with one bar holding **← Channels**,
  the channel name and **More**. **More** shows the filters, search, sort,
  channel actions and the Assistant / Members / Files / Leaderboard / Desk
  panels. The message box takes the width and Send is an icon button.
- **Backlog**: each item is a card (title first, actions underneath).
- **Executions and Inbox**: the list above the selected item; run facts read
  on one line ("Model gpt-5-codex") and the run's event log is part of the
  page.
- **Dialogs** (New task, Execute, file viewer) open as sheets from the bottom
  of the screen with their buttons always visible, above the on-screen
  keyboard.

On touch screens, buttons, rows and tabs are at least 44 px tall, form fields
use 16 px text, body text is 15 px and small text 14 px (chips, ids and times
12–13 px); your text size setting still applies.
Escape closes the top dialog or drawer; it never closes the work-item drawer
while you are typing or editing the spec.

## Develop from source

The shared UI kit (`@abstractframework/ui-kit`,
`@abstractframework/panel-chat`) and the session proxy
(`@abstractframework/app-server`) are regular npm dependencies, so a plain
clone builds:

```bash
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
- [Responsive layout](#responsive-layout) — tablets, phones and window sizes
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow

## License

MIT — see [LICENSE](LICENSE).
