# Troubleshooting

Symptom-first. Each entry links to the page owning the full explanation.

## Sign-in / connectivity

**The banner says "Gateway unreachable or not signed in."**
The app probes the gateway with a one-run list. Check that the gateway is
running and that the server's gateway URL (`--gateway-url`, or
`abstractcontinuum config get gateway_url`) or the URL you entered in the
connect dialog points at it; `abstractcontinuum` prints the gateway it
resolved at startup. Then sign in again from the connection badge at the bottom of
the sidebar. See [getting-started.md](getting-started.md#first-run).

**Sign-in succeeds but every action fails with 403 `csrf_required`.**
Mutating requests need the CSRF header derived from the
`abstractcontinuum_gateway_csrf` cookie. If you front the app with a proxy,
make sure cookies pass through unmodified and that you did not strip
`x-abstractcontinuum-csrf` / `x-abstract-csrf`. See
[security.md](security.md).

**"Browser-supplied Gateway URL changes are disabled for this non-local host."**
You opened the app from a non-loopback host and tried to change the gateway
URL at sign-in. Pin the URL server-side (`--gateway-url`, or
`abstractcontinuum config set gateway_url <url>`) or explicitly enable
remote config (`--allow-remote-gateway-config`) — see
[configuration.md](configuration.md).

**About shows "Gateway: unavailable (…)".**
The dialog could not read `GET /api/gateway/about`; the reason in brackets
says why. `HTTP 404` means the gateway does not serve the About route: upgrade
it to a version with `GET /about`. `HTTP 401` or a network error means the
session or the gateway is gone: follow the "Gateway unreachable" entry above.
The rest of the app is unaffected. See [faq.md](faq.md).

## Executions

**Execute says the runner is disabled / not running / the executor is missing.**
The gateway's exec worker is off or its executor is not installed. A gateway
admin enables it in **Settings → Gateway administration → Exec runner** (it
applies at once) and picks an installed **Executor**, or on the gateway's
computer runs `abstractgateway config set backlog_exec_runner on` and
`abstractgateway config set executor codex`. The agent program must be
installed on the gateway's computer. See
[configuration.md](configuration.md#gateway-side-features).

**A planned item's Execute button says "Processing…".**
The item already has a live exec request. Follow it on the **Executions**
page; the button returns to **Execute** when the request finishes.

**Promotion is blocked with conflicts.**
Prod diverged from the candidate's base while the agent worked. Use
**Iterate** to re-run the request on top of current prod, or resolve the
listed files manually.

**UAT URLs do not respond after "Restart UAT".**
The detail pane shows a probe warning when UAT processes fail their URL
check. Open **Services → UAT** and read the process logs; the process
manager must be enabled for UAT deploys (**Settings → Gateway administration
→ Process manager**, or `abstractgateway config set process_manager on`).

**Live logs say "#TRUNCATION: log tail truncated".**
Live logs are bounded: each fetch reads at most the last 160 KB, and the
followed view keeps about 1 MB. The complete logs stay on the gateway with
the exec request; switch between **events**, **stderr** and **last
message** to read the part you need.

## Inbox / services

**Inbox shows only the Email tab.**
Triage is a prop (`enable_triage`) wired on in this app; if you embed the
page elsewhere, pass it explicitly. Email account features additionally
depend on the gateway's email configuration.

**The Services page says the process manager is disabled.**
A gateway admin turns on **Settings → Gateway administration → Process
manager** (or
`abstractgateway config set process_manager on`) and sets the backlog folder
to the framework checkout it manages — read [security.md](security.md)
first: this enables remote service control.

**The Board says "This gateway's backlog folder is not available".**
The gateway's saved backlog folder no longer exists (or is not a folder). An
admin clicks **Use the gateway's own folder** (the gateway creates it) or
**Choose a folder…** (a folder containing `docs/backlog`; the gateway
explains a refusal). A fresh gateway never shows this: it starts on its own
folder, and the Board shows **Your backlog is empty**. The same panel
appears when the gateway is older than 0.4.1: upgrade the gateway. See
[getting-started.md](getting-started.md#your-backlog).

## Team page

**The Team page reports `hub_seat_unavailable`.**
The server has no key for the configured seat. Check the seat on
**Settings → Team (agora hub) → Hub seat** (or
`abstractcontinuum config get hub_seat`) and either provision it in the key
store (`--hub-keys`, default `~/.agora/keys.json`) or start Continuum with
`--hub-token-file <path>`. `GET /api/hub/meta` shows the hub URL, seat,
and whether a key was found. See
[configuration.md](configuration.md#team-page-agora-hub).

**The Team page works on localhost but not from another machine.**
The hub proxy refuses non-loopback peers by default. Start Continuum with
`--hub-allow-remote` (or `abstractcontinuum config set hub_allow_remote on`)
only behind your own access control:
everyone who reaches the page posts as the configured seat.

## Development

**`npm run dev` fails resolving `@abstractframework/ui-kit`.**
The source build expects a sibling `../abstractuic` checkout (Vite aliases
+ `file:` dependency). Clone [AbstractUIC](https://github.com/lpalbou/AbstractUIC)
next to this repo as `abstractuic` and run `npm install` again. The
published npm package does not need it.

**Tests fail with `scrollIntoView is not a function`.**
jsdom lacks it; the suites stub `Element.prototype.scrollIntoView` in their
`beforeEach` — copy that pattern into new component tests.
