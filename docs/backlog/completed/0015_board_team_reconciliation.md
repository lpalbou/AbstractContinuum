# Completed: Board reflects Team work — pointer-claim join widening + Done items

> Priority: P1
> Labels: operator-intake, board
> Type: feature

- Work id: `abstractcontinuum-0015`
- Thread anchor: operator dm 94 ("when the agents work, they should create
  backlog and this should reflect in the board. currently, i don't see any
  of my task in team reflected in the board, this is wrong") + dm 95 (the
  ongoing-work honesty ask).

## Problem (diagnosed on his screenshot: In Progress 0 while the room works)

1. Seats claim with FREE-TEXT store keys (`claim:agent-0011-sibling-…`)
   whose VALUE carries the pointer (`item`, `card`) — the S3 join keyed
   only on id-shaped KEYS, so live work renders nowhere.
2. Operator-intake work is worked without a planned/ file (retro-minted at
   completion) — nothing to join while it is in flight.
3. Completed ITEMS never render: the Done column shows exec attempts only
   (a pre-unification ruling his dm 94 supersedes — "shows what is done").

## What this ships

- Join widening: a claim row joins by its VALUE's `item` work id (or
  `card` filename) when the key is free-text — one convention, both
  spellings render.
- Done column: recent completed backlog FILES (claim-done receipts) render
  alongside exec attempts, labeled distinctly.
- Practice: this very item is minted planned/ + claimed id-keyed BEFORE
  the build (the intake rule the room is asked to adopt).

## Receipts (completed 2026-07-19)

- Join widened: claim rows resolve via value.item first, id-shaped key as
  fallback (`claim_row_item`); done-marked rows feed the Done lane.
- Synthetic in-progress cards for claims without a file card on this
  gateway (cross-repo work visible); Done shows recent completed team
  work beside exec attempts, `⛏ owner` attributed.
- Claims lane decoupled from the gateway session (hub-only — team work
  renders even signed out).
- Suite 300 green; live-verified: In Progress 6 / Done 10 rendered from
  hub claims alone (screenshot in dm 94 reply).
