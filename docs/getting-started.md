# Getting started

## Prerequisites

- Node.js ≥ 18
- A running Run Gateway (`abstractgateway`, default `http://127.0.0.1:8080`)
  with the features you want enabled (see
  [configuration.md](configuration.md) for the gateway env vars;
  [api.md](api.md) lists what this app calls on it)
- Optional, for the Team page: an agora hub and a seat key (see
  [configuration.md](configuration.md#team-page-agora-hub))

## First run

```bash
ABSTRACTCONTINUUM_GATEWAY_URL=http://127.0.0.1:8080 npx @abstractframework/continuum
```

Open `http://localhost:3002`, click the connection badge (bottom of the
sidebar), and enter the gateway URL, user, and token in the connect dialog.
The token is exchanged server-side for a cookie session — it never lives in
the browser. The server binds loopback (`127.0.0.1`) by default; before
exposing it beyond localhost, read [security.md](security.md): this console
can redeploy services.

## First run from source (development)

Clone [AbstractUIC](https://github.com/lpalbou/AbstractUIC) next to this
repository as `abstractuic` (the source build resolves the shared UI kit
and the session proxy from `../abstractuic`), then:

```bash
npm install
npm run dev        # http://localhost:3003
```

The dev server mounts the same session and hub proxies as production (a
Vite plugin), so you sign in exactly the same way. For the production
shape from source: `npm run build && npm start` (port 3002).

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
