# Work-item conventions (the board's grammar)

This is the canonical reference for the conventions AbstractContinuum's
board and the gateway's backlog parser agree on. It exists so process
teachings (the `backlog`/`coredoc` skills on the AbstractSkill shelf) and
the rendering/enforcing surface cannot drift apart: **the deployment's
parser is truth; this document describes it.**

Changes to any grammar below must update this file in the same change
as the parser or board code that implements them.

## File layout and lifecycle

Work items are markdown files under `docs/backlog/` in the gateway's backlog
folder (the `triage_repo_root` setting; by default the gateway's own
`<data dir>/backlog/`):

| Directory | Board home | Meaning |
| --- | --- | --- |
| `proposed/` | Triage column | ideas, not yet ready |
| `planned/` | Ready column | ready to execute (DoR applies) |
| `completed/` | Done column (recent) | promoted/archived items |
| `deprecated/` | Backlog page only | closed without execution (restorable) |
| `trash/` | Backlog page only | discarded (restorable) |
| `recurrent/` | Backlog page only | periodic process tasks — **no board home (ruled)** |

Execution states ride exec requests, not directories: `queued` / `running`
(In progress), `awaiting_qa` (In review), `promoted`/`completed`/`failed`
(terminal). Promotion archives the planned file to `completed/`.

## Title line (H1)

```markdown
# 0123-package: [TYPE] Short imperative title
```

- `0123` — item id (stable, list-assigned).
- `package` — the owning package (`framework` for cross-cutting work).
- `[TYPE]` — the ruled work-item enum, UPPERCASE in the H1.

## Type vocabulary (ruled enum)

`bug | feature | improvement | task` — per the semantics seat's
`decision:workitem-type-enum`. The UI offers exactly these four; **read
paths never coerce**: an unknown at-rest type renders as-written with a
"labeled unknown" chip. Do not invent new types in items; propose enum
changes to the semantics seat.

> **Upstream normalization**: the gateway list parser accepts the full
> type enum (`improvement` included). Unknown at-rest words normalize to
> `task` upstream, so the console's labeled-unknown chip fires only for
> values the gateway lets through.

## Metadata lines (blockquote grammar — NOT a `## Metadata` section)

The gateway parses **blockquote lines** in the file header. List
sections like `## Metadata` with `- Created:` bullets are **not parsed**
— an item written that way renders metadata-blind on the board.

```markdown
> Created: 2026-07-13 21:00:00 +0200
> Type: bug
> Priority: P1
> Labels: ui, wave-doctoring, seat-memory
```

- `Priority`: `P0` (drop everything) … `P3` (someday). Absent = unranked
  (sorts last within its column).
- `Labels`: comma-separated free strings. Sprints are labels (`sprint-N`).

## Definition of Ready (the execution gate, not advice)

Execute is **gated**, client-side (advisory chips) and server-side (the
gateway refuses `409 definition_of_ready_failed` unless an explicit
override is recorded as `dor_overridden`). The checks:

1. Type present (H1 `[TYPE]` or `> Type:` line), in the ruled enum
   (`bug | feature | improvement | task`).
2. A `## Summary` section with prose (non-placeholder).
3. Acceptance criteria as markdown checkboxes (`- [ ] …`, non-placeholder).
4. A Testing section naming how it will be verified (backticked commands;
   `...`/`n/a` don't count — ADR-0019 levels).

The gate is FOUR checks (matching the gateway parser `backlog_dor.py`):
**priority is NOT a gate check** — it is advisory metadata the board
renders as chips.

Overrides are legitimate (the operator's judgment wins) but always
explicit and recorded — never silent.

## Definition of Done

Acceptance checkboxes ticked + QA review (the drawer's Review tab) before
promote. "Done" means validated — the promote flow is the verification
surface, and an unreviewed promote carries its unconfirmed count on the
button label.

## Supervision vocabulary (room coordination on the board)

| Label | Meaning | Board behavior |
| --- | --- | --- |
| `decision-gate` | an OPERATOR decision (his gates stay his) | renders as an amber "operator gate" card — never draggable, never promotable, never executable; resolved only by the operator's ruling |
| `wave-<slug>` | a room wave (directive fanned to N seats) | normal task item; the Supervision toggle filters to these |
| `seat-<owner>` | the seat(s) owning the row | chip + Supervision filter |

Per-seat receipts inside a wave item are acceptance checkboxes carrying
the hub message id:

```markdown
- [ ] gateway: writer wave shipped (c1234)
- [x] continuum: supervision view live (c1240)
```

## Docs freshness

A package's `llms.txt`/`llms-full.txt` are stale when they are **older than
the newest `docs/*.md`** — regenerate the llms files in the same change that
edits docs. Every package is expected to carry `README.md`, `docs/`,
`llms.txt`, and `llms-full.txt`.

## Sources

- Parser: gateway backlog family (list-level metadata; DoR gate).
- Board: `src/ui/board/board_model.ts` (metadata regexes, readiness,
  gate semantics — test-pinned).
- Type enum: the hub decision `decision:workitem-type-enum`.
