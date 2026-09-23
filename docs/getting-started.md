# Getting started

## Prerequisites

- Node.js ≥ 18
- A running Run Gateway (`abstractgateway`, default `http://127.0.0.1:8080`)
  with the features you want enabled (see
  [configuration.md](configuration.md) for the gateway env vars;
  [api.md](api.md) lists what this app calls on it)
- A sibling `../abstractuic` checkout — required for `npm install`,
  `npm run build`, AND `npm start` (the session proxy is a `file:`
  dependency and the UI kit resolves via Vite aliases) until the package
  publishes

## First run (development)

```bash
npm install
npm run dev
```

Open `http://localhost:3002`. The dev server mounts the same session
proxy as production (vite plugin), so sign in exactly the same way: click
the connection badge (bottom of the sidebar) and enter the gateway URL,
user, and token in the connect dialog. The token is exchanged for session
cookies and never stored in the browser.

## First run (production shape)

```bash
npm run build
ABSTRACTCONTINUUM_GATEWAY_URL=http://127.0.0.1:8080 npm start
```

Open `http://localhost:3002` and sign in with a gateway user token. The
token is exchanged server-side for a cookie session — it never lives in the
browser. Before exposing this beyond localhost, read
[security.md](security.md): this console can redeploy services.

## Your first execution

1. **Backlog → Planned** — pick an item (or create one with **New**: the
   draft is prefilled from the shared template; guided fields and AI assist
   can flesh it out).
2. Press **Execute**. Keep the default **UAT** mode; confirm. The app jumps
   to the live view.
3. **Executions** (or Backlog → Processing) — watch the request move
   queued → running with live event logs (commands, tokens, outputs).
4. When it reaches **awaiting QA**: click **Restart UAT** to deploy the
   candidate to the shared UAT stack and try it; then either
   **Approve → promote to prod** or **Iterate (send feedback)** with QA
   notes — the agent re-runs on top of its candidate.

Note: sessions persist for 30 days; use Sign out in Settings on shared
machines.

## Where to go next

- [architecture.md](architecture.md) — how the pieces fit
- [configuration.md](configuration.md) — every knob
- [troubleshooting.md](troubleshooting.md) — when something misbehaves
