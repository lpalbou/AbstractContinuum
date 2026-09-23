# Proposed: consume gateway list-level metadata + promote-carry

## Metadata
- Created: 2026-07-12
- Status: HALF LANDED 2026-07-12 — gateway shipped list metadata (c1090)
  and the client now consumes it (chips/filters/sort exact from the list;
  lazy scan is the #FALLBACK for older gateways). Promote-carry remains
  open (gateway took it in c1095: "taken, not blocking").
- Completed: N/A (promote-carry half open)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The board renders priority/label chips from convention lines in the item
markdown header (`> Priority:`, `> Labels:` — grammar specified in c1088).
Two gateway gaps cap the feature:
1. List summaries don't carry the parsed metadata → chips hydrate via a
   bounded lazy content fetch (40 items/refresh, concurrency 4, session
   cache) and priority/label FILTERS are deliberately absent (filtering
   over a lazy cache silently drops unhydrated cards).
2. Promote copies the agent's candidate over prod → operator-set header
   lines vanish at promote, so metadata is a planned/proposed-lane feature
   and "what did sprint-29 ship?" is unanswerable through Done.

## Current code reality
- `board_model.parse_work_item_metadata` + `use_board_data.hydrate_metadata`
  (cache; no interval re-hydration — staleness accepted and commented).
- Board filters: search/package/type only; priority sort best-effort.

## Proposed direction
When the gateway ships (their lane): consume `priority`/`labels[]` from
list summaries (delete the lazy cache), restore priority/label filters +
sprint grouping, and render label chips through Done once promote carries
header lines.

## Landed 2026-07-12 (list-metadata half)
- `BacklogItemSummary` carries optional `priority`/`labels` (absent keys =
  older gateway); `derive_board_cards` copies them onto cards.
- Chip precedence helpers (`chip_priority`/`chip_labels`/`card_has_chip_meta`):
  list answer wins — including an explicit "none" (`""`/`[]`), which must
  never be backfilled from a stale content cache. Content scan remains as
  labeled #FALLBACK for older gateways; on c1090 gateways the scan runs
  only for Ready cards (DoR dot needs content-only signals).
- Facets/search/sort/coverage chip all read through the precedence
  helpers; pins in `board_model.test.ts` ("chip precedence" describe).

## Promotion criteria
Promote-carry ships gateway-side and Done-lane chips render from carried
header lines.

## Validation ideas
- Shared test vectors with the gateway parser (offered in c1088); filter
  correctness pins over full-list metadata.

## Non-goals
- Client-side N+1 full hydration; invented sprint storage.
