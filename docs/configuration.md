# Configuration

Configuration lives in three places:

- **The Continuum server** (`abstractcontinuum`): environment variables,
  below. The server has no configuration file and no flags beyond `--help`
  and `--version`.
- **The gateway**: the backlog folder, exec runner, executor, and process
  manager are gateway settings, changed from Settings → Gateway
  administration, the gateway console, or `abstractgateway config set`
  (see [Gateway-side features](#gateway-side-features)).
- **The browser**: per-browser preferences on the Settings page.

Credentials never live in this repository or in browser storage: the
gateway token is exchanged for a server-held session, and the hub seat key
is read on the server.

## Server (`abstractcontinuum` / `npm start` / `bin/cli.js`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (loopback by default; set `0.0.0.0` only behind your own access control) |
| `ABSTRACTCONTINUUM_GATEWAY_URL` | `http://127.0.0.1:8080` | Gateway this deployment talks to |
| `ABSTRACTGATEWAY_URL` | — | Fallback for the above (shared across Abstract apps) |

Session-proxy hardening knobs (from `@abstractframework/app-server`, appId
`abstractcontinuum`; all default OFF):

| Variable | Effect |
| --- | --- |
| `ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` / `ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` | Allow non-loopback browsers to change the gateway URL at sign-in. Leave off unless you front the app with your own access control. |
| `ABSTRACTCONTINUUM_ALLOW_BROWSER_GATEWAY_URL_COOKIE` | Honor a browser-supplied gateway-URL cookie on non-loopback hosts. |
| `ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS` / `ABSTRACTGATEWAY_TRUST_PROXY_HEADERS` | Trust `x-forwarded-host` for the loopback check (set only behind a reverse proxy you control). Cookies get the `Secure` attribute whenever `x-forwarded-proto: https` is present, independent of this flag. |

## Team page (agora hub)

The Team page talks to an agora hub through the server's `/api/hub/*`
proxy, which forwards an allowlisted subset of the hub API and attaches one
operator seat's API key server-side. The key never reaches the browser.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ABSTRACTCONTINUUM_HUB_URL` | `http://127.0.0.1:8765` | Hub base URL (fallback: `AGORA_HUB_URL`) |
| `ABSTRACTCONTINUUM_HUB_SEAT` | `operator` | The seat the Team page reads and posts as — set this to your own seat |
| `ABSTRACTCONTINUUM_HUB_KEYS` | `~/.agora/keys.json` | Key store; the entry `"<hub_url>::<seat>"` supplies the seat key (re-read per request, so rotation needs no restart) |
| `ABSTRACTCONTINUUM_HUB_KEY` | — | Seat API key; overrides the key store |
| `ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE` | off | Set to `1` to let non-loopback browsers use the hub proxy. Leave off unless you front the app with your own access control. |

Without a key, hub routes other than the keyless health check answer
`503 hub_seat_unavailable` naming the seat and key store to provision;
`GET /api/hub/meta` reports the configured hub URL, seat, and whether a key
is present.

## Gateway-side features

The pages light up according to the connected gateway's settings. A fresh
gateway needs none of them to show a working (empty) Board: it keeps its own
backlog in `<gateway data dir>/backlog/`, created with a starter overview and
item template on first use.

| Gateway setting | Enables | Change it |
| --- | --- | --- |
| `triage_repo_root` (Backlog folder) | Where the Board / Backlog / Executions read and write items: a folder containing `docs/backlog`. Default: the gateway's own folder | Settings → Gateway administration (*Change…*, *Use the gateway's own folder*); gateway console Apps → *Backlog settings*; `abstractgateway config set triage_repo_root PATH`; `abstractgateway serve --backlog-root PATH` for one run |
| `backlog_exec_runner` | The exec worker (Executions + backlog Processing views) | Settings (*Enable*); `abstractgateway config set backlog_exec_runner on`; `serve --exec-runner on` |
| `executor` | The agent that runs queued items (`codex`, `claude`, `cursor-agent`, `abstractcode`) | Settings (Executor); `abstractgateway config set executor codex` |
| `process_manager` | The Services page (high trust — see [security.md](security.md)); process control also needs the backlog folder set to the framework checkout it manages | Settings (*Enable*); `abstractgateway config set process_manager on` |

All Settings entries above live under **Settings → Gateway administration**;
`abstractgateway config get` prints the current values on the gateway's
computer.

Settings shows where each value comes from: *launch flag* (a saved value
applies once the gateway restarts without the flag), *setting*,
*environment (legacy)* (saving a value here replaces it) or *default*. Only
a gateway admin can change them; the gateway validates every change and its
refusal is shown as is.

When the backlog folder is not available (a saved folder that was deleted or
unmounted), the Board, Backlog and Executions pages show the folder and the
reason; an admin gets **Use the gateway's own folder** and **Choose a
folder…**, everyone else is told to ask the gateway admin.

## Browser Settings page

Persisted in `localStorage` under `abstractcontinuum_settings_v1`:

| Setting | Purpose |
| --- | --- |
| Default execution mode | `UAT` (default, staged) or `Inplace` (edits prod) for the Execute dialog. |
| Maintenance AI provider / model / reasoning effort | Provider, model and reasoning effort for backlog AI assist + maintenance chat (blank = gateway default). |
| Backlog advisor agent | Gateway bundle id for the advisor (blank = `basic-agent`). |

Voice overrides (Settings → voice panel) are stored separately under
`abstractcontinuum_voice_override_v1`.

Connection is NOT a settings field: the shared `GatewayConnectModal`
(sidebar badge, or "Manage connection" in Settings) signs in through
`POST /api/connection/gateway`; the token is exchanged once for HttpOnly
session cookies and never stored browser-side.

## Development

`npm run dev` starts Vite on :3003 with `/api` proxied to
`http://localhost:8080` (see `vite.config.ts`); the dev server mounts the
same session and hub proxies as production. The ui-kit and panel-chat
packages resolve from a sibling `../abstractuic` checkout.
