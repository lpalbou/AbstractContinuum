# Planned: extend the reading hierarchy to every markdown surface

## Metadata
- Created: 2026-07-21
- Status: Completed
- Completed: 2026-07-21

## Outcome

The typography rules moved from `.team_row_body`-scope to the shared
`.md_doc` scope; every markdown host passes `className="md_doc"` through
the kit's className prop (renders as `div.pc-md.md_doc`): message rows
(via MemoMarkdown), file viewer segments (mermaid interleave untouched),
charter drawer, LLM summaries, Team drawer content tab, board item
drawer, report inbox (decision draft + two report views), exec detail
pane + exec events view (the last two found missing by the standing wave
adversary, P2-5) — 11 hosts.
Row-scoped behavior (clamp heights, first-child zeroing) stayed on
`.team_row_body`. `.item_summary_text` compact margins still win by
specificity (0,2,0 over 0,1,1) — board summaries stay dense. Probe
updated to the shared class; 313 tests, build + probe green.

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context

The dm-116 typography fix (real heading scale, rhythm, strong/code
contrast) was scoped to `.team_row_body` — message rows. The console's
OTHER markdown hosts still render the kit's flat heading scale (all h1–h5
one size, body-gray):

- the file viewer (`team_file_viewer.tsx`) — THE long-document surface
  (plan documents, 46KB reports at ~1020px);
- the channel charter drawer;
- LLM thread summaries;
- the Team drawer content tab;
- the board work-activity panel / item drawer (if markdown-hosted).

## Direction

One shared `md_doc` class applied at each markdown HOST container; the
typography rules move from `.team_row_body`-scoped to `.md_doc`-scoped.
The row body keeps both classes (clamp/preview rules stay row-scoped).
The markdown probe keeps asserting the computed styles.

## Acceptance

- All console markdown hosts carry `md_doc`; headings render the scale +
  `--text-primary` on every surface.
- Row-scoped behavior (clamp heights, tight last-child) unchanged.
- Probe + tests green.
