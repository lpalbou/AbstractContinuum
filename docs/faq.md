# FAQ

**How is this different from AbstractObserver?**
One honest purpose each: the observer *observes and discusses* the running
system (runs, ledgers, artifacts, memory graphs, entities); continuum
*develops and deploys* it (backlog, executions, triage, process control).
They were one app until 2026-07-12 (`history.md` records the split).

**Is this tied to Codex?**
No. The executor is a gateway setting: Codex CLI (`codex`, the default),
Claude Code (`claude`), Cursor Agent (`cursor-agent`) or AbstractCode
(`abstractcode`). Pick it in Settings → Gateway administration → Executor,
or with `abstractgateway config set executor <id>`; the UI reads the
executor identity from `/backlog/exec/config`.

**What is the difference between UAT and inplace execution?**
UAT (default) runs the agent in a candidate workspace; you inspect the
result on the shared UAT stack and explicitly promote to prod. Inplace runs
directly in the production workspace — faster, dangerous, labeled as such.

**Which gateway version do I need?**
AbstractGateway 0.4.1 or newer. It serves the backlog folder state and the
settings that Settings → Gateway administration edits; see
[api.md](api.md).

**Which version am I running?**
Click the (i) About button in the top-right cluster. It shows the Continuum
version, the versions your gateway reports, and links to the documentation
and issue tracker.

**Why is the Services page empty / why is Execute disabled?**
Those features exist only when a gateway admin turns them on: the process
manager and the exec runner are gateway settings (Settings → Gateway
administration, or `abstractgateway config set process_manager on` /
`backlog_exec_runner on`); see [configuration.md](configuration.md#gateway-side-features).

**Where is my backlog stored?**
In the gateway's backlog folder: by default the gateway's own
`<data dir>/backlog/`, or any project folder containing `docs/backlog/` that
an admin chooses. The Board's empty state shows the path. See
[getting-started.md](getting-started.md#your-backlog) and
[conventions.md](conventions.md) for the file layout.

**Can I read an environment variable's value from the ENV tab?**
No, by design. Managed env vars are write-only: the gateway never returns
values to the browser. You can see whether a value is set and where it came
from, and you can set/unset it.

**Why does a planned item's Execute button say "Processing…"?**
The item already has a live exec request, so it cannot be executed twice.
Follow it on the **Executions** page (or in the Board's In Progress / In
Review columns) until the request finishes.

**Does the app store any secrets?**
No. Sessions are server-held HttpOnly cookies; raw tokens are exchanged
once at sign-in and never stored browser-side. See
[security.md](security.md).
