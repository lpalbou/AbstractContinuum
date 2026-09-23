# Proposed: decide the intended order for repeated attachment inserts

## Metadata
- Created: 2026-07-12
- Status: Completed
- Completed: 2026-07-21

## Outcome

Decision: APPEND (chronological — uploads read oldest→newest). The walk
now tests the RAW line for an indented list item (`/^\s+-\s/`) instead of
trimming first (trimming ate the indent, so the walk broke at the first
entry and prepended). Deeper/tab indents from hand-edited files stay
covered. The pinned-quirk test flipped to assert append + a new
hand-edited-indent case. 313 tests green.

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Found while pinning `insert_attachment_links` before the monolith split.
When a backlog item already has an `- Attachments:` block, newly uploaded
attachment links are inserted directly under the header — BEFORE existing
entries — because the insert walk trims each line before testing the
`"  -"` continuation prefix and therefore never advances past the first
entry.

## Current code reality
- `src/ui/backlog/model.ts` `insert_attachment_links` (behavior inherited
  verbatim from the observer implementation).
- Pinned as-is in `model.test.ts`
  ("adds entries to an existing attachments block (current behavior: prepends)").

## Problem or opportunity
Cosmetic inconsistency: first upload batch reads top-to-bottom in upload
order; later batches prepend. Both render fine; nothing breaks.

## Proposed direction
Decide intended order (append feels natural), fix the continuation test to
compare against the untrimmed line, and update the pin.

## Promotion criteria
Any user/maintainer confirms the intended order, or the next touch of
`model.ts` wants to carry it along.

## Validation ideas
- Update the existing pin to the chosen order; add a two-batch scenario.

## Non-goals
- Reordering existing attachment blocks in stored backlog files.
