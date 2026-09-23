# Configuration

All configuration is environment-driven on the server side plus a small
browser Settings page. Secrets stay in the environment — nothing in this
repo or in browser storage holds credentials in same-origin mode.

## Server (`npm start` / `bin/cli.js`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `ABSTRACTCONTINUUM_GATEWAY_URL` | `http://127.0.0.1:8080` | Gateway this deployment talks to |
| `ABSTRACTGATEWAY_URL` | — | Fallback for the above (shared across Abstract apps) |

Session-proxy hardening knobs (from `@abstractframework/app-server`, appId
`abstractcontinuum`; all default OFF):

| Variable | Effect |
| --- | --- |
| `ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` / `ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` | Allow non-loopback browsers to change the gateway URL at sign-in. Leave off unless you front the app with your own access control. |
| `ABSTRACTCONTINUUM_ALLOW_BROWSER_GATEWAY_URL_COOKIE` | Honor a browser-supplied gateway-URL cookie on non-loopback hosts. |
| `ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS` / `ABSTRACTGATEWAY_TRUST_PROXY_HEADERS` | Trust `x-forwarded-host` for the loopback check (set only behind a reverse proxy you control). Cookies get the `Secure` attribute whenever `x-forwarded-proto: https` is present, independent of this flag. |

## Gateway-side features

The pages light up according to what the connected gateway enables:

| Gateway variable | Enables |
| --- | --- |
| `ABSTRACTGATEWAY_BACKLOG_EXEC_RUNNER=1` | The exec worker (Executions + backlog Processing views) |
| `ABSTRACTGATEWAY_BACKLOG_EXECUTOR=codex_cli` | Executor selection (reported by `/backlog/exec/config`) |
| `ABSTRACTGATEWAY_BACKLOG_CODEX_BIN` / `..._CODEX_MODEL` | Executor binary + model |
| `ABSTRACTGATEWAY_ENABLE_PROCESS_MANAGER=1` | The Processes page (high trust — see [security.md](security.md)) |
| `ABSTRACTGATEWAY_TRIAGE_REPO_ROOT` | Repo root for backlog/triage/process features |

The Executions and Backlog pages surface actionable messages (with the
required env) when a feature is disabled or the worker is down.

## Browser Settings page

Persisted in `localStorage` under `abstractcontinuum_settings_v1`:

| Setting | Purpose |
| --- | --- |
| Maintenance AI provider / model | Provider/model for backlog AI assist + maintenance chat (blank = gateway default). |
| Backlog advisor agent | Gateway bundle id for the advisor (blank = `basic-agent`). |

Connection is NOT a settings field: the shared `GatewayConnectModal`
(sidebar badge, or "Manage connection" in Settings) signs in through
`POST /api/connection/gateway`; the token is exchanged once for HttpOnly
session cookies and never stored browser-side. Older builds' persisted
direct-mode tokens are scrubbed at startup.

## Development

`npm run dev` starts Vite on :3002 with `/api` proxied to
`http://localhost:8080` (see `vite.config.ts`). The ui-kit and panel-chat
packages resolve from a sibling `../abstractuic` checkout.
