# Getting started

## Prerequisites

- Node.js ≥ 18
- A running Run Gateway: AbstractGateway 0.4.1 or newer (`abstractgateway`,
  default `http://127.0.0.1:8080`). [api.md](api.md) lists what this app
  calls on it.
- Optional, for the Team page: an agora hub and a seat key (see
  [configuration.md](configuration.md#team-page-agora-hub)). Set your seat
  on **Settings → Team (agora hub) → Hub seat**, or with
  `abstractcontinuum config set hub_seat <seat>`.

## First run

```bash
npx @abstractframework/continuum --gateway-url http://127.0.0.1:8080
```

`--gateway-url` is only needed when your gateway is neither the one
installed on this computer (Continuum reads its address from
`~/.abstractframework/gateway.json`) nor on `http://127.0.0.1:8080`. To keep a setting, save it instead of repeating the
flag: `abstractcontinuum config set gateway_url http://my-gateway:8080`
(`abstractcontinuum --help` lists every flag;
[configuration.md](configuration.md#server-abstractcontinuum--npm-start--binclijs)
has the details).

Open `http://localhost:3002`; the connect dialog opens when you are not
signed in (or use the connection button at the top right). Enter the gateway
URL, user, and token.
The token is exchanged server-side for a cookie session — it never lives in
the browser. The server binds loopback (`127.0.0.1`) by default; before
exposing it beyond localhost, read [security.md](security.md): this console
can redeploy services.

## First run from source (development)

From a clone of this repository (the shared UI kit and the session proxy
are npm dependencies):

```bash
npm install
npm run dev        # http://localhost:3002
```

The dev server mounts the same session, hub and settings routes as
production (a Vite plugin) and reads the same settings file, so you sign in
exactly the same way. For the production shape from source:
`npm run build && npm start` (port 3002; pass flags after `--`, for example
`npm start -- --hub-seat alice`).

## Your backlog

A fresh gateway needs no setup: it keeps its own backlog in
`<gateway data dir>/backlog/` (created with a starter overview and item
template the first time you open the Board), so the Board opens on
**Your backlog is empty** with the folder path and **Create your first item**.

To work on a project's backlog instead (any folder that contains
`docs/backlog/`), a gateway admin sets **Settings → Gateway administration →
Backlog folder → Change…**, or runs `abstractgateway config set
triage_repo_root /path/to/project` on the gateway's computer. Executing items
also needs the exec runner: **Settings → Gateway administration → Exec runner
→ Enable** (or `abstractgateway config set backlog_exec_runner on`). See
[configuration.md](configuration.md#gateway-side-features).

## Your first execution

1. Pick a **Ready** item on the **Board** (or **Backlog → Planned**), or
   create one with **New**: the draft is prefilled from the backlog
   template; guided fields and AI assist can flesh it out.
2. Press **Execute**. The Definition-of-Ready checklist shows what the item
   is missing (you can override it explicitly). Keep the default **UAT**
   mode; confirm. The app opens the request on the **Executions** page.
3. **Executions** — watch the request move queued → running with live event
   logs (commands, tokens, outputs).
4. When it reaches **awaiting QA**: click **Restart UAT** to deploy the
   candidate to the shared UAT stack and try it; then either
   **Approve → promote to prod** or **Iterate (send feedback)** with QA
   notes — the agent re-runs on top of its candidate.

Note: sessions persist for 30 days; use Sign out in Settings on shared
machines.

## Where to go next

- [../README.md](../README.md) — the pages at a glance
- [architecture.md](architecture.md) — how the pieces fit
- [conventions.md](conventions.md) — how to write items the Board and the
  Definition of Ready understand
- [configuration.md](configuration.md) — every knob
- [troubleshooting.md](troubleshooting.md) — when something misbehaves
