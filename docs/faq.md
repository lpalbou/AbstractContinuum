# FAQ

**How is this different from AbstractObserver?**
One honest purpose each: the observer *observes and discusses* the running
system (runs, ledgers, artifacts, memory graphs, entities); continuum
*develops and deploys* it (backlog, executions, triage, process control).
They were one app until 2026-07-12 (`history.md` records the split).

**Is this tied to Codex?**
No. The gateway currently executes backlog items through the Codex CLI, but
the executor is a pluggable seam: the UI reads the executor identity from
`/backlog/exec/config` and renders whatever the gateway reports. Other
agents can power the same pipeline.

**What is the difference between UAT and inplace execution?**
UAT (default) runs the agent in a candidate workspace; you inspect the
result on the shared UAT stack and explicitly promote to prod. Inplace runs
directly in the production workspace — faster, dangerous, labeled as such.

**Why don't I see the Processes page content / why is Execute disabled?**
Those features exist only when the gateway operator enabled them. The UI
shows the exact env vars required (`ABSTRACTGATEWAY_ENABLE_PROCESS_MANAGER`,
`ABSTRACTGATEWAY_BACKLOG_EXEC_RUNNER`, …); see
[configuration.md](configuration.md).

**Can I read an environment variable's value from the ENV tab?**
No, by design. Managed env vars are write-only: the gateway never returns
values to the browser. You can see whether a value is set and where it came
from, and you can set/unset it.

**Where do "planned items hidden while queued/running" go?**
Items with an active exec request are hidden from Planned to prevent double
execution; they are visible under Processing until the request finishes.

**Does the app store any secrets?**
No. Sessions are server-held HttpOnly cookies; raw tokens are exchanged
once at sign-in and never stored browser-side. (The former development
"direct mode" that kept a bearer in `localStorage` was removed; startup
scrubs tokens persisted by older builds.) See [security.md](security.md).
