# Configuration

Configuration lives in three places:

- **The Continuum server** (`abstractcontinuum`): launch flags and a
  settings file, below. The hub seat is also on the Settings page.
- **The gateway**: the backlog folder, exec runner, executor, and process
  manager are gateway settings, changed from Settings → Gateway
  administration, the gateway console, or `abstractgateway config set`
  (see [Gateway-side features](#gateway-side-features)).
- **The browser**: per-browser preferences on the Settings page.

Credentials never live in this repository or in browser storage: the
gateway token is exchanged for a server-held session, and the hub seat key
is read on the server.

## Server (`abstractcontinuum` / `npm start` / `bin/cli.js`)

Every server setting has a launch flag and a key in the settings file:

```bash
abstractcontinuum --hub-seat alice --gateway-url http://127.0.0.1:8080   # this run
abstractcontinuum config set hub_seat alice                              # saved
```

When a setting is given more than once, the launch flag wins, then the
settings file, then the environment (legacy), then the default.
`abstractcontinuum config get` lists every setting with its value and
where it comes from; the hub token is shown only as *set* or *not set*.

### Settings file

`~/.abstractcontinuum/settings.json` (`--settings-file <path>` picks
another). It is a JSON object with the setting names below as keys, written
by:

- `abstractcontinuum config set <setting> <value>` and
  `abstractcontinuum config unset <setting>` (same names as the flags;
  `config path` prints the file's location);
- `abstractcontinuum config set hub_token --from-file <path>`, which keeps
  the token out of your shell history;
- the Settings page, for the hub seat.

The file and its folder are owner-only (`0600` / `0700`) because the file
may hold the hub token. Continuum reads it at start and again whenever it
changes, so a new hub seat, hub URL, hub token, key store or
`hub_allow_remote` applies to the Team page without a restart. Port, bind
address, gateway URL and the sign-in settings apply at the next start. A
file that is not valid JSON stops the start with a message naming it.

### Settings

| Launch flag | Setting | Default | Purpose | Legacy environment |
| --- | --- | --- | --- | --- |
| `--port <n>` | `port` | `3002` | HTTP port | `PORT` |
| `--host <address>` | `host` | `127.0.0.1` | Bind address (loopback by default; use `0.0.0.0` only behind your own access control) | `HOST` |
| `--gateway-url <url>` | `gateway_url` | `http://127.0.0.1:8080` | Gateway this deployment talks to | `ABSTRACTCONTINUUM_GATEWAY_URL`, `ABSTRACTGATEWAY_URL` |
| `--hub-url <url>` | `hub_url` | `http://127.0.0.1:8765` | Agora hub for the Team page | `ABSTRACTCONTINUUM_HUB_URL`, `AGORA_HUB_URL` |
| `--hub-seat <seat>` | `hub_seat` | `operator` | The seat the Team page reads and posts as — set it to your own seat (also on the Settings page) | `ABSTRACTCONTINUUM_HUB_SEAT` |
| `--hub-token <token>`, `--hub-token-file <path>` | `hub_token` | none | Seat API key; overrides the key store. Prefer the file form: a flag value is visible in the process list | `ABSTRACTCONTINUUM_HUB_KEY` |
| `--hub-keys <path>` | `hub_keys` | `~/.agora/keys.json` | Key store; the entry `"<hub_url>::<seat>"` supplies the seat key (re-read per request, so rotation needs no restart) | `ABSTRACTCONTINUUM_HUB_KEYS` |
| `--hub-allow-remote` | `hub_allow_remote` | off | Let browsers on other machines use the hub proxy. Leave off unless you front the app with your own access control | `ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE` |
| `--allow-remote-gateway-config` | `allow_remote_gateway_config` | off | Let browsers on other machines change the gateway URL at sign-in (implies `allow_gateway_url_cookie`). Leave off unless you front the app with your own access control | `ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG`, `ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` |
| `--allow-gateway-url-cookie` | `allow_gateway_url_cookie` | off | Honor a browser-supplied gateway-URL cookie on non-loopback hosts | `ABSTRACTCONTINUUM_ALLOW_BROWSER_GATEWAY_URL_COOKIE` |
| `--trust-proxy-headers` | `trust_proxy_headers` | off | Trust `x-forwarded-host` for the loopback check (only behind a reverse proxy you control). Cookies get the `Secure` attribute whenever `x-forwarded-proto: https` is present, independent of this setting | `ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS`, `ABSTRACTGATEWAY_TRUST_PROXY_HEADERS` |
| `--settings-file <path>` | — | `~/.abstractcontinuum/settings.json` | Settings file to read and write | — |

On/off settings take `--hub-allow-remote`, `--hub-allow-remote=off` or
`--no-hub-allow-remote` on the command line, and `on`/`off` with
`config set`.

The last column is for existing setups only: those variables are still
read when neither a flag nor a setting gives the value, and Settings and
`config get` report them as *environment (legacy)*. Saving a setting
replaces them.

## Team page (agora hub)

The Team page talks to an agora hub through the server's `/api/hub/*`
proxy, which forwards an allowlisted subset of the hub API and attaches one
seat's API key server-side. The key never reaches the browser.

Set your seat once, in any of three ways:

- **Settings → Team (agora hub) → Hub seat**, then *Save*. The page shows
  where the current seat comes from (*launch flag*, *setting*,
  *environment (legacy)* or *default*); *Use default* removes the saved
  seat. This works from the computer Continuum runs on only.
- `abstractcontinuum config set hub_seat <seat>` in a terminal.
- `abstractcontinuum --hub-seat <seat>` for one run (it wins over the
  saved seat until Continuum restarts without it).

The seat key comes from `--hub-token-file` / the `hub_token` setting, or
from the seat's entry in the key store. Without a key, hub routes other
than the keyless health check answer `503 hub_seat_unavailable` naming the
seat and key store to provision; `GET /api/hub/meta` reports the hub URL,
seat, and whether a key is present. `GET /api/continuum/settings` returns
the server settings with their sources (the token as present or not), and
`PUT` on it with `{"hub_seat": "<seat>"}` or `{"hub_seat": null}` is how
the Settings page saves — loopback and same-origin only.

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

`npm run dev` starts Vite on the same port as the server (`port`, default
3002) with `/api` proxied to the configured gateway (see `vite.config.ts`);
it reads the same settings file and mounts the same session, hub and
settings routes as production. Vite takes no Continuum flags: use
`abstractcontinuum config set` for dev settings, or `npm run dev -- --port
<n>` for another port. Stop a running `npm start` first, or pick another
port. The ui-kit and panel-chat packages resolve from a sibling
`../abstractuic` checkout.
