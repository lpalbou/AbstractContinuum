# AbstractContinuum — history

## 2026-07-12 — Born from the observer split (maintainer directive)

### Why this repo exists

The maintainer's ruling (2026-07-12, verbatim intent): move all code related
to CI/CD development — codex steering and its surroundings — out of
`abstractobserver`, so that each app has ONE honest purpose:

- **abstractobserver** — *observe and discuss*: watch runs, ledgers,
  providers, artifacts, memory graphs, and summoned entities; talk to the
  system to understand it. It changes nothing about the framework itself.
- **abstractcontinuum** — *continuous iterative development and deployment*:
  browse and edit the backlog, steer codex executions against backlog items,
  review execution requests (feedback / promote / deploy-to-UAT / log tails),
  triage bug and feature reports and email, and control managed prod/UAT
  processes (start/stop/restart/redeploy, env vars).

The two concerns had grown together inside the observer because the gateway
serves both API families. The observer's navigation carried Backlog / Inbox /
Processes beside Observe / Runtime — a development console living inside a
monitoring app, gated by env flags (`ABSTRACTOBSERVER_ENABLE_BACKLOG`,
`ABSTRACTOBSERVER_ENABLE_INBOX_TRIAGE`). The split gives the development
console its own name, its own release cadence, and room to grow into the
framework's continuous-development surface without diluting the observer.

### What moved (verbatim, from abstractobserver @ the 2026-07-12 working tree)

| File | Lines | What it is |
| --- | --- | --- |
| `src/ui/backlog_browser.tsx` | 4,141 | Backlog CRUD (planned/proposed/completed/recurrent/deprecated/trash), codex execution pipeline (execute, batch, exec requests, feedback, promote, deploy-UAT, log tail), AI assist/maintain/advisor drawers, attachments |
| `src/ui/report_inbox.tsx` | 669 | Bug/feature report inbox + triage decisions |
| `src/ui/email_inbox.tsx` | 541 | Email accounts/messages/send + triage run |
| `src/ui/processes_page.tsx` | 552 | Managed prod/UAT process control + env vars |
| `src/ui/exec_event.ts` (+ its test) | 115 | Codex exec-log event parsing |
| `src/ui/styles.test.ts` | — | Full original copy (the backlog/inbox CSS pins live here now) |

Copied (shared modules the pages depend on — the observer keeps its own):

| File | Why |
| --- | --- |
| `src/lib/gateway_client.ts` (+ `types.ts`, `sse_parser.ts`) | The typed gateway API client. The continuum copy still carries the FULL surface; pruning it to the development families (backlog/exec/reports/email/triage/processes + the few shared reads) is the continuum agent's cleanup task. |
| `src/ui/modal.tsx`, `src/ui/multi_select.tsx`, `src/ui/use_gateway_voice.ts` | Small shared UI helpers the moved pages import. Candidates for `abstractuic` adoption rather than two copies — coordinate with the uic seat. |
| `src/ui/styles.css` | Full observer stylesheet copy. The dev-lane rules (`.backlog*`, `.inbox_*`, `.exec_*`, `.advisor_*`) were REMOVED from the observer's copy (376 lines); pruning the observation-lane rules from THIS copy is the continuum agent's task. |

### What was removed from the observer (same day, suite green at 173 tests)

- Pages `backlog` / `inbox` / `processes` from the page union, navigation
  tabs, render conditionals, and the settings block for the backlog advisor.
- The `ABSTRACTOBSERVER_ENABLE_BACKLOG` / `ABSTRACTOBSERVER_ENABLE_INBOX_TRIAGE`
  env knobs (bin/cli.js injection + `read_ui_flag` + vite-env types).
- ~1,000 lines of dev-lane methods/types from the observer's
  `gateway_client.ts` (report inbox reads, email/triage, backlog CRUD +
  codex exec pipeline, managed-process control) — a marker comment names
  this repo as the new home.
- 376 lines of dev-lane CSS and the backlog CSS pin test.

### The scaffold this repo starts with

- Vite + React app mirroring the observer's toolchain (`npm run dev` on
  :3002, `npm run build`, `npm test` with vitest).
- `src/app.tsx` — a deliberately minimal shell: nav (Backlog / Inbox /
  Processes / Settings), one `GatewayClient`, settings persisted to
  localStorage. The moved pages render with their full behavior.
- `bin/cli.js` — static serve + the shared app-origin gateway session proxy
  (`@abstractframework/app-server`, appId `abstractcontinuum`: cookies
  `abstractcontinuum_gateway_*`, CSRF header `x-abstractcontinuum-csrf`,
  env gates `ABSTRACTCONTINUUM_*`/`ABSTRACTGATEWAY_*`). Same-origin cookie
  sessions; tokens never in URLs.
- ui-kit / panel-chat consumed from `../abstractuic` via aliases, exactly
  like the observer.

Verified at birth: `tsc` clean, vite build green, `node --check bin/cli.js`
green, vitest green (the moved exec_event pins + the full styles pins).

### Known debts handed to the continuum agent (deliberate, labeled)

1. `gateway_client.ts` is the full observer client — prune to the
   development families; keep the door for shared reads (runs list for
   context, artifacts for exec outputs).
2. `styles.css` is the full observer stylesheet — prune to what the three
   pages + shell use; adopt `@abstractframework/ui-kit` semantic tokens for
   anything new.
3. `modal.tsx` / `multi_select.tsx` / `use_gateway_voice.ts` are copies —
   propose adoption into `abstractuic` (one source) instead of drifting.
4. The shell has no fleet/status affordances — the backlog exec pipeline
   deserves a live "what is codex doing right now" surface (exec requests
   already poll; make them first-class).
5. `package.json` depends on `@abstractframework/app-server` via `file:` —
   publish-gated exactly like the observer (swap to a semver range when uic
   publishes).
6. No docs/ yet beyond this file; no CHANGELOG.md; no CI. Bootstrap them.

### Release/commit posture

Standing rule (maintainer, 2026-07-10): do NOT commit work without his word.
The repo is `git init`-ed with this working tree uncommitted; the first
commit is the maintainer's call.
