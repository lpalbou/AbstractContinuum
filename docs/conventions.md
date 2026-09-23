# Work-item conventions (the board's grammar)

This is the canonical reference for the conventions AbstractContinuum's
board and the gateway's backlog parser agree on. It exists so process
teachings (the `backlog`/`coredoc` skills on the AbstractSkill shelf) and
the rendering/enforcing surface cannot drift apart: **the deployment's
parser is truth; this document describes it.**

Scope note: authored 2026-07-13 (skill canvass c1676 ask 5; fold design
c1694/c1697). The gateway seat co-signs the parser half; changes to any
grammar below must update this file in the same change.

## File layout and lifecycle

Work items are markdown files under `docs/backlog/` in the repository the
gateway serves (`ABSTRACTGATEWAY_TRIAGE_REPO_ROOT`):

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

> **Upstream-normalization caveat (skill's fable5 find c3546; gateway
> fix c3556)**: the gateway list parser now accepts the full ruled enum
> (`improvement` included — the coercion that made the DoR type-refusal
> unreachable is fixed). Remaining honest limit: genuinely UNKNOWN
> at-rest words still normalize to `task` upstream, so the console's
> labeled-unknown chip fires only for values the gateway lets through;
> raw-unknown survival is a priced-but-unscheduled gateway change.

## Metadata lines (blockquote grammar — NOT a `## Metadata` section)

The gateway parses **blockquote lines** in the file header (c1090). List
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

The gate is FOUR checks (gateway co-sign c3514, verified against the
shipped parser `backlog_dor.py`): **priority is NOT a gate check** — it is
advisory metadata the board renders as chips. An earlier revision of this
document listed "Priority set" as a fifth check; that taught a check the
gate does not run.

Overrides are legitimate (the operator's judgment wins) but always
explicit and recorded — never silent.

## Definition of Done

Acceptance checkboxes ticked + QA review (the drawer's Review tab) before
promote. "Done" means validated — the promote flow is the verification
surface, and an unreviewed promote carries its unconfirmed count on the
button label.

## Supervision vocabulary (room coordination on the board, c1631/c1634)

| Label | Meaning | Board behavior |
| --- | --- | --- |
| `decision-gate` | an OPERATOR decision (his gates stay his) | renders as an amber "operator gate" card — never draggable, never promotable, never executable; resolved only by the operator's ruling |
| `wave-<slug>` | a room wave (directive fanned to N seats) | normal task item; the Supervision toggle filters to these |
| `seat-<owner>` | the seat(s) owning the row | chip + Supervision filter |

Per-seat receipts inside a wave item are acceptance checkboxes carrying
the hub message id:

```markdown
- [ ] gateway: writer wave shipped (c1608)
- [x] continuum: supervision view live (c1636)
```

## Docs freshness (the coredoc half)

The Projects conformance read (designed c1660) flags a package red when
`llms.txt`/`llms-full.txt` is **older than the newest `docs/*.md`** —
regenerate the llms files in the same change that edits docs. Presence
checks: `README.md`, `docs/`, `llms.txt`, `llms-full.txt`.

## Sources

- Parser: gateway backlog family (list-level metadata c1090; DoR gate c1140).
- Board: `src/ui/board/board_model.ts` (metadata regexes, readiness,
  gate semantics — test-pinned).
- Rulings: `decision:workitem-type-enum` (semantics), c1631 supervision
  directive, c1634 mapping, c1694 fold design.
