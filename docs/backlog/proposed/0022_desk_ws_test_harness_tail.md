# Proposed: desk + WS relay test-harness tail (adversary deferrals)

## Metadata
- Created: 2026-07-21
- Status: Proposed
- Completed: N/A

## Context

The 2026-07-21 standing-adversary fold (3 P1 + 8 P2, all fixed same-hour)
named its deferred test debt on the record: the fixes shipped verified by
probes + code review, but two surfaces lack page-level pins.

## Scope

- Desk drawer page-harness tests: 403 vs 404 copy split, transient 5xx
  does NOT latch `desk_poll_dead`, badge amber/green derivation, auto-open
  once-per-session (marker only spent when the open happens), ≥30s poll
  throttle.
- WS relay unit test with a fake `ws` module: the browser-dies-during-
  connect leak (upstream reaped on socket close; destroyed socket never
  handed to handleUpgrade) — the P1-1 class, currently covered only by
  the liveness probe.
- `mark_read_to` pins: target = `visible_max_seq` under a filter; empty
  filtered view disables the act.
- Backfill split pins: click-Unread-mid-load coverage re-check, one
  attempt per (channel, floor), failure notice.

## Acceptance

- All four surfaces pinned; suite green; no probe-only coverage left on
  the dm-99/0017 reliability lanes.
