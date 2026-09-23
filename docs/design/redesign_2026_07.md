# AbstractContinuum redesign — board-first development console (2026-07)

Maintainer directive (2026-07-12): completely redesign the app — layout,
categories, components — drawing on kanban boards (Monday, Jira, GitHub
Projects), sprints/scrum; think agent recruitment/assignment, labels,
priorities, work types, expected outcomes and tests, and how to ENFORCE
good engineering practice. Reuse abstractuic components (authentication in
particular). The gateway connection experience must use the shared
component.

## 1. Diagnosis of the current app

- Auth is broken in dev and homegrown everywhere: the Settings page used a
  hand-rolled sign-in form, and the Vite dev server has no session proxy,
  so `POST /api/connection/gateway` falls through to the gateway and 404s
  ("Not Found" — the reported bug). abstractuic ships
  `GatewayConnectModal`/`GatewaySessionSignInCard` (extracted from
  AbstractFlow, maintainer-endorsed) on exactly this contract.
- The information architecture is tool-shaped, not work-shaped: "Backlog"
  is a file browser with tabs named after directories
  (planned/proposed/…), and the pipeline is a tab inside it. An operator
  thinks in flow: idea → ready → executing → review → done.
- No concept of priority, labels, agents-as-assignees, or readiness
  gates — the things that make a development console enforce engineering
  discipline rather than just browse files.

## 2. Information architecture (new)

Left sidebar (icon rail + labels), slim header (brand · connection badge ·
New task). Landing = Board.

| Section | Purpose | Data |
| --- | --- | --- |
| **Board** | THE work surface: kanban of work items across the flow | backlog lists + exec requests |
| **Executions** | Live pipeline detail (what is running NOW, log follow) | exec requests + config |
| **Backlog** | Full catalog power view (all kinds incl. recurrent/deprecated/trash, search, batch execute/merge, advisor) | existing page |
| **Agents** | The workforce: executor roster, model, load, track record | exec config + request history |
| **Inbox** | Intake: bug/feature reports, email, triage → work items | existing page |
| **Services** | Deploy surface: prod/UAT processes + env (HIGH TRUST) | existing page |
| **Settings** | Connection (shared uic card) + AI prefs | uic + localStorage |

## 3. The Board

Columns are derived from `kind` + exec status (no new storage):

| Column | Derivation (as ruled in §10b) | Card actions |
| --- | --- | --- |
| Triage | kind=proposed, not busy | → Ready · open drawer |
| Ready | kind=planned, not in the active_items busy set | Execute (DoR-gated) · → Triage (demote) · open |
| In Progress | live request queued/running (single or batch card) | open drawer · Follow live (preselects in Executions) |
| In Review | live request awaiting_qa | Review tab (DoD checklist → promote/iterate/UAT) |
| Done | recent terminal ATTEMPTS (promoted/completed requests) | open drawer (kind-resolves to the archived file) |
| Failed | recent failed ATTEMPTS (history; the file stays in Ready with a ⚠ badge) | open drawer → iterate/re-execute |

Card face: title, readiness dot, `#id`, type chip, priority chip (P0–P3),
package, label chips, batch size, live duration (1s ticker) + agent chip
when executing, ⚠ failure badge on Ready. Filters: text, package, type +
a label FACET row (click-to-filter) with an honest "scanned X/Y" coverage
pill until gateway list-metadata lands.

Drag: Triage↔Ready both directions (backlog_move; buttons kept as
fallback). Ready→In Progress opens the Execute dialog (never silent
execution — it is a deploy-capable action).

## 4. Work-item drawer (card click)

Right-side drawer, three tabs (opens on the tab matching the card's
column). RULED SCOPE (amended per the build + adversary folds): deep
tooling (maintenance AI chat, attachments, advisor) stays on the Backlog
page — the drawer states so; live logs stay on Executions — the drawer
links there with the request PRESELECTED.

- **Spec** — markdown view/edit (sha-guarded) + priority/labels metadata
  editor + an execution-snapshot staleness warning when a live request
  exists. Kind-resolution: uncertain targets (Done attempts) try
  completed → planned → proposed instead of erroring.
- **Runs** — this item's exec history (status-scoped fetch, window
  labeled), View logs / Follow live jump with preselection.
- **Review** — DoD checklist (text-keyed, session-scoped, provenance
  note), blocked-promotion surfacing, and QA actions with a TWO-STEP
  promote confirm (promote writes prod + redeploys — the heaviest action
  carries the heaviest gate).

## 5. Work-item metadata model

The gateway stores work items as markdown; the template already carries
`> Created:` / `> Type:` metadata lines and `## Acceptance Criteria` /
`## Testing (ADR-0019)` sections. We EXTEND the same convention (no new
storage, human-readable, agent-writable):

```markdown
> Priority: P1        (P0 critical | P1 high | P2 normal | P3 low)
> Labels: ui, security, sprint-29
```

- Parsed client-side from item content; written by the drawer's metadata
  editor and the New task dialog.
- List-level visibility (chips on cards without opening each item) needs
  the gateway to surface parsed metadata in list summaries — ASK filed
  (commons; see §9). Until then: cards show metadata lazily once an item
  has been opened (session cache), labeled degradation, no N+1 fetch.
- "Sprint" = a label by convention (`sprint-N`) + a board filter. No
  invented storage the gateway doesn't have.

## 6. Enforcing engineering discipline

**Definition of Ready (DoR)** — evaluated by parsing the item spec; shown
as a checklist in the Execute dialog and as a readiness dot on cards:

1. Type is set (bug/feature/task).
2. Summary is non-empty (not the template placeholder).
3. ≥ 1 acceptance criterion (checkbox bullet under Acceptance Criteria).
4. ≥ 1 concrete test command under Testing (Level A/B).

The gate is ADVISORY (ruled in §10b: client-side; the server-side gate is
a gateway ask): the checklist names failing checks WITH parse evidence,
the confirm button is labeled "Execute anyway (override)" when checks
fail and "Execute (readiness unknown)" when the spec could not be scanned
(never a silently absent gate), and an "Open spec to fix" button jumps to
the drawer. Rationale: gates that cannot be overridden get worked around;
gates that name their reasons get satisfied.

**Definition of Done (DoD)** — in Review, acceptance criteria render as a
checklist the reviewer ticks; Promote shows "N criteria unconfirmed" until
all are ticked (again: warning + override, not a hard wall). The QA panel
already enforces the structural half (human approval before prod).

## 7. Agents (recruit & assign)

Today the gateway has ONE configured executor (codex CLI + model +
reasoning effort from env), and each exec request records
`target_agent`/`target_model`/`target_reasoning_effort`. The Agents page
is honest about that while building the seam the maintainer wants:

- **Roster**: the configured executor as an agent card (name, model,
  reasoning effort, alive/available state) + the backlog advisor agent.
- **Track record** (from status-scoped exec request history): per
  target_agent — COUNTS, not rates (§10b ruling: QA iterations mutate one
  request, batches count once, attribution follows the gateway stamp) —
  runs, active, promoted, completed, in-review, failed, avg run time,
  last active.
- **Assignment**: the Execute dialog shows the assigned agent (built).
  Per-task agent/model override is an ENDPOINT GAP (execute takes only
  execution_mode today) — ask filed with the gateway seat (§9); the picker
  UI enables itself when the endpoint accepts overrides.

## 8. Component reuse (abstractuic)

- `GatewayConnectModal` + `fetchGatewayConnection` + `gatewayStatusBadge`:
  THE connection surface (header badge opens it; Settings embeds
  `GatewaySessionSignInCard`). Deletes the homegrown form.
- `Icon`, theme tokens, `AfSelect` where selects need search.
- Vite dev server mounts the SAME `createGatewaySessionProxy` middleware
  as `bin/cli.js`, so dev auth = prod auth (fixes the 404 class).
- Modal/MultiSelect stay local copies pending the c1073/c1079 adoption.

## 9. Cross-seat asks (posted on agora commons)

1. **uic**: review/bless the reuse plan; flag anything board-shaped they
   want to own in the kit later (columns/cards are app-side for now).
2. **gateway**: (a) list-level metadata — surface `priority`, `labels`
   (and later `sprint`) parsed from the metadata lines in backlog list
   summaries; (b) per-request agent override — optional
   `target_model`/`target_reasoning_effort` (validated against an allowed
   set) on execute/execute_batch.

## 10. Out of scope (this wave)

- Multi-executor orchestration (needs gateway work first).
- Real sprint objects/burndown (storage doesn't exist; label convention
  covers the workflow need).
- Kit-side board components (build app-side, extract later if uic wants).
- WIP limits, swimlanes, multi-board.

## 10b. Adversarial design review fold (fable5, 2026-07-12)

The pre-build adversary returned 2 P0 + 7 P1; every finding was verified
against gateway source before folding. Ruled corrections:

1. **Join rewrite (P0s)** — batch requests carry the synthetic filename
   `batch(N)` and their real members only in `backlog_queue`; the busy set
   now comes from the gateway's batch-aware `active_items` expansion (the
   SAME source the Backlog page uses — one "is it busy" answer everywhere).
   Batch cards are `req:`-keyed multi-item cards (never a fake filename).
   ONE source per column: Done/Failed are recent ATTEMPTS (requests); the
   completed-file archive stays on the Backlog page. Failed is ruled as
   HISTORY: the file stays executable in Ready with a ⚠ failure badge.
   Request fetches are status-scoped (live vs terminal) so QA debt can
   never fall out of a window churned by terminal history.
2. **Metadata lifecycle ruled** — promote replaces the prod file with the
   agent-authored candidate, so header metadata lines do not survive the
   pipeline today. Chips/DoR are therefore a planned/proposed-lane feature;
   through-Done sprint queries wait on the gateway carrying header lines
   through promote (added to the gateway ask, with the exact line grammar).
   The Spec tab warns when a live request holds a queue-time snapshot.
   Priority/label FILTERS are cut until list-level metadata exists
   (filtering over a lazy cache silently drops unhydrated cards); chips +
   priority-first ordering stay, and search matches hydrated labels.
3. **Enforcement honesty** — the DoR gate is client-side and ADVISORY (any
   curl bypasses it); the checklist now shows parse EVIDENCE ("found 2:
   …") so mis-parses are visible; the server-side gate (an execute-time
   `dor` check with explicit override) is a filed gateway ask, not a
   claim.
4. **DoD ticks** — keyed by criterion text (index keys re-attach after
   edits), session-scoped and labeled as such; persistence on the exec
   request is a gateway ask. Criteria provenance (prod file vs candidate)
   is stated in the Review tab.
5. **Agents page kept** (maintainer explicitly asked for the story) with
   counts-not-rates and the attribution caveat (iterations mutate one
   request; batches count once; `target_agent` defaults to codex).
6. **Ruled explicitly**: board v1 is single-item flow — merge/batch/advisor
   stay on the Backlog page; recurrent items are Backlog-only (their
   executions surface as pipeline cards); Executions = ops view with live
   log follow, drawer = per-item view linking to it.

## 10c. Post-build adversary folds (fable5 ×2, 2026-07-12)

Adversary 2 (code, SHIP-WITH-FIXES) + adversary 3 (UX/product,
"delivered-with-gaps") — all P0/P1 findings folded same-day:

- **Sprint usability (UX P0)**: label FACET row with click-to-filter +
  honest "scanned X/Y" coverage pill (search shares the caveat) — sprints
  are usable without waiting on the gateway ask.
- **Silent gate bypass (both)**: execute now fetches the spec on demand
  when unhydrated; a scan failure renders an EXPLICIT "not evaluated"
  state and an "Execute (readiness unknown)" button label.
- **Fix loop (UX)**: "Open spec to fix" in the failing gate; drawer states
  where deep tooling lives.
- **Review evidence + weight (UX)**: "View run logs" preselects the run in
  Executions; promote is a two-step confirm naming prod + redeploy;
  blocked promotions surface in the drawer (parity with the pipeline).
- **Done-card 404 (both)**: uncertain drawer targets kind-resolve
  completed → planned → proposed.
- **Degradation contract (code P1)**: board fetches are allSettled — one
  failing endpoint degrades (labeled `#FALLBACK`, busy-set falls back to
  live request filenames), never blanks; total failure keeps the previous
  board.
- **Metadata loss paths (code P1)**: chosen priority/labels are written
  via follow-up update when the draft was empty; partially-uploaded
  attachments get linked even when a later upload fails; warnings surface
  in a shell banner (previously swallowed by the header-modal host).
- **Truth bundle (both)**: one coherent (label, tone) per connection state
  (probe flip re-checks the session); recurrent creation lands on Backlog
  with an explanatory notice; drag Triage↔Ready built (buttons kept);
  live-duration ticker on executing cards; agents/drawer request fetches
  status-scoped; probe debounced (no per-keystroke fetches); dev CORS
  removed; parser hardened (header-block-only metadata, H3+ sections,
  summary-prefix headings) with duplicate-line-safe metadata writes.
- **Vocabulary gap logged, not invented**: the maintainer's
  "improvement" work type is a gateway/template enum question — raised on
  the gateway thread rather than minted client-side.
- Pins added for the adversary's top-3 untested behaviors: drawer target
  derivation (kind fallback + batch matching + two-step promote), board
  degradation contract, gate rendering under unknown/failing readiness.

## 11. Build plan

1. Auth fix: dev-server session proxy + uic connect modal/card everywhere.
2. Shell: sidebar + header + connection badge.
3. `board/` modules: metadata/DoR parsing (`board_model.ts`, pure +
   pinned), data composition (`use_board_data.ts`), columns/cards
   (`board_page.tsx`), drawer (`work_item_drawer.tsx`).
4. Agents page.
5. Execute dialog DoR gate; Review DoD checklist.
6. Tests: parsing pins, DoR gate, board grouping, drawer wiring.
7. Three fable5 adversaries: design (pre-build), code, UX/product.
