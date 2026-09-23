# 0010: [IMPROVEMENT] Team/Settings adversary P2 tail (2026-07-14 fold)

> Created: 2026-07-14
> Type: improvement
> Priority: P2
> Labels: team-page, settings, adversary-fold

## Summary

The 2026-07-14 three-adversary review of the Team/Settings redesign produced
a P0/P1 fold (shipped same day) and a P2 tail deliberately deferred. This
item tracks the tail so it is not rediscovered the hard way.

## Deferred findings

- **Per-row memoization on the Team thread list** — the skip-if-unchanged
  poll write fixed the selection-wipe root cause, but when new traffic DOES
  arrive every row still re-renders (200 markdown parses worst case).
  `React.memo` on a row component keyed by message id + expanded state.
- **Sender-color theme derivation** — `hsl(h, 60%, 55%)` is a compromise
  lightness readable on both dark and light kit themes; the right shape is
  a token-driven lightness (needs a uic seam — filed with them when the
  next kit wave opens).
- **Vigilance filter: hub escalation axes** — `effective_urgency` /
  `escalated` from the wire are not yet folded into the vigilance filter
  (they are served on /inbox envelopes, not channel messages; needs a
  merge keyed by seq).
- **`pane_subtitle` grammar** — `pane_count` doubles as a tagline slot in
  Settings/Agents ("preference — this browser"); a dedicated class would
  keep counts and prose distinct.
- **Settings exec chip single-source** — the worst-of exec-pipeline chip
  derives from `backlog_exec_config` while the Enable button derives from
  `admin_cfg.backlog_exec_runner`; they can momentarily disagree after a
  toggle (the detail line explains it, but one source would be cleaner).
- **Ack to last visible** — "Mark read to here" acks the window's latest
  seq regardless of the active filter (tooltip says so); an ack-to-last-
  visible-message variant would be more precise.

## Acceptance criteria

- [x] Team rows memoized; a background poll with no new traffic causes
      zero row re-renders (pin with a render-count probe).
- [x] Vigilance filter folds escalated/effective_urgency when available.
- [x] `pane_subtitle` exists and Settings/Agents use it; `pane_count`
      carries only counts.

## Outcome (2026-07-21)

- **Markdown memo boundary** (`src/ui/memo_markdown.tsx`): the expensive
  per-row cost is the markdown PARSE, and message text is immutable once
  posted — `React.memo(Markdown)` at the row body skips the re-parse for
  unchanged rows when new traffic re-renders the page (string props compare
  by value, so the recomputed autolink pipeline string still hits the
  memo). Render-count probe pins it (`memo_markdown.test.tsx`): 3 texts →
  3 parses across repeated parent re-renders; one changed text → exactly
  one more parse. (No-traffic polls were already render-free via the
  skip-if-unchanged poll write.)
- **Vigilance escalation fold**: `escalated_seqs_by_channel` merges
  `escalated`/`effective_urgency=interrupt` from /inbox envelopes by seq
  into `FilterContext.escalated_seqs`; the vigilance case ORs it. Unit
  tests both sides.
- **pane_subtitle**: new class (muted italic); the five prose uses in
  Settings/Agents switched; `pane_count` carries only counts/ids now.
- **Ack-to-last-visible** (deferred finding, also shipped): under an
  active filter "Mark read" targets the last VISIBLE seq (empty filtered
  view disables); "all" keeps window-latest. Tooltip names the semantics.
- **Not shipped, still deferred**: sender-color token derivation (needs
  the uic seam — filed with them), exec-chip single-source (the
  posture_nonce re-derivation already converges the two sources after a
  toggle; a true single source needs the gateway to serve one config —
  noted, low value).
