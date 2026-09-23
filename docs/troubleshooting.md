# Troubleshooting

Symptom-first. Each entry links to the page owning the full explanation.

## Sign-in / connectivity

**The header LED stays gray (gateway unreachable).**
The app probes with a 1-run list. Check the gateway is running and that
`ABSTRACTCONTINUUM_GATEWAY_URL` (or the Settings gateway URL in dev) points
at it. In same-origin mode, `bin/cli.js` logs the gateway it resolved at
startup.

**Sign-in succeeds but every action fails with 403 `csrf_required`.**
Mutating requests need the CSRF header derived from the
`abstractcontinuum_gateway_csrf` cookie. If you front the app with a proxy,
make sure cookies pass through unmodified and that you did not strip
`x-abstractcontinuum-csrf` / `x-abstract-csrf`. See
[security.md](security.md).

**"Browser-supplied Gateway URL changes are disabled for this non-local host."**
You opened the app from a non-loopback host and tried to change the gateway
URL at sign-in. Pin the URL server-side
(`ABSTRACTCONTINUUM_GATEWAY_URL`) or explicitly enable remote config — see
[configuration.md](configuration.md).

## Executions

**Execute button says the runner is disabled / not running / codex missing.**
The gateway's exec worker is off or misconfigured. The confirm dialog shows
the exact env needed (`ABSTRACTGATEWAY_BACKLOG_EXEC_RUNNER=1`,
`ABSTRACTGATEWAY_BACKLOG_EXECUTOR`, `..._CODEX_BIN`, `..._CODEX_MODEL`) and
a copy button. Restart the gateway after setting them.

**A planned item disappeared.**
It is executing: Planned hides items with an active request ("N planned
items hidden while queued/running"). Find it under Processing.

**Promotion is blocked with conflicts.**
Prod diverged from the candidate's base while the agent worked. Use
**Iterate** to re-run the request on top of current prod, or resolve the
listed files manually.

**UAT URLs do not respond after "Restart UAT".**
The detail pane shows a probe warning when UAT processes fail their URL
check. Open Processes → UAT and read the process logs; the process manager
must be enabled for UAT deploys
(`ABSTRACTGATEWAY_ENABLE_PROCESS_MANAGER=1`).

**Log tail says "(tail truncated)".**
Live tails are bounded (160 KB). For finished requests, use the
**Execution log** button (Completed → Tasks → item) — it loads the full log
from ledger artifacts, with a bounded-tail fallback for requests that
predate artifact capture.

## Inbox / processes

**Inbox shows only the Email tab.**
Triage is a prop (`enable_triage`) wired on in this app; if you embed the
page elsewhere, pass it explicitly. Email account features additionally
depend on the gateway's email configuration.

**Processes page says the manager is disabled.**
Set `ABSTRACTGATEWAY_ENABLE_PROCESS_MANAGER=1` and
`ABSTRACTGATEWAY_TRIAGE_REPO_ROOT` on the gateway host — and read
[security.md](security.md) first: this enables remote service control.

## Development

**`npm run dev` fails resolving `@abstractframework/ui-kit`.**
The dev toolchain expects a sibling `../abstractuic` checkout (Vite aliases
+ `file:` dependency). Clone it next to this repo and `npm install` again.

**Tests fail with `scrollIntoView is not a function`.**
jsdom lacks it; the suites stub `Element.prototype.scrollIntoView` in their
`beforeEach` — copy that pattern into new component tests.
