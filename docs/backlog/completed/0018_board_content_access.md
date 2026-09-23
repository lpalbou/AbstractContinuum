# Completed: every board card opens real content (operator dm 110)

> Priority: P0
> Labels: operator-intake, board
> Type: bug

- Work id: `abstractcontinuum-0018`
- Thread anchor: operator dm 110 ("unacceptable. i must have proper access
  to everything in the board") — his click on the 0017 hub-row card landed
  on the claim-facts pointer note instead of content. Two fable5
  adversarial audits running (his order); fix follows their findings.

## Summary

Hub-backed board cards (work rows, claims) dead-end in a facts panel.
Every card must open its full content: spec (gateway file when served),
discussion + receipts (/work activity index), Team-thread deep link —
worst case an activity panel, never a "go search" note.

## Acceptance Criteria

- [ ] Clicking ANY board card opens content (no pointer-note dead ends).
- [ ] Work-row cards whose package is gateway-served open the real file
      drawer (spec/runs/review).
- [ ] Foreign-package cards open a work-activity panel (claims, receipts,
      citing messages with deep links to the Team page).
- [ ] The 0017-class dedup gap (file exists but synthetic card rendered)
      is root-caused and fixed.

## Testing

- `npm test` (board model pins incl. new resolution-ladder pins)
- headless playwright probe: click each card class, assert content opens

## Receipts (completed 2026-07-20)

- Both fable5 audits delivered (ground truth + design); both dead ends
  closed: hub-backed cards open the WorkActivityPanel (row facts + /work
  claims/decisions/citing messages + Team deep links); the unclaimed
  work-row class no longer falls into the blank "batch execution" drawer.
- Probe-first drawer: work-row cards whose card path resolves on this
  gateway open the REAL file drawer.
- Dual-key dedup (derived id + card-path basename) with fact TRANSFER
  onto file cards (pinned: the package-spelling divergence case).
- Board→Team focus navigation (channel select + scroll-to-message +
  anchor-fetch merge for messages outside the window).
- Root cause recorded: the gateway serves ONE backlog root (umbrella
  repo); package chips are file-header labels. Multi-root serving asked
  of gateway (structural fix for full spec text of seat-repo files).
- Suite 309 green; live-verified: the exact 0017 card laurent hit opens
  the activity panel; Ready work-row cards open it too; Team landing OK.
