# Planned: message-display reliability tail (dm 99 audit follow-ups)

## Metadata
- Created: 2026-07-21
- Status: Completed
- Completed: 2026-07-21

## Outcome

All four findings fixed and verified same-night:
- F5: backfill effect split — snapshot capture at filter entry, coverage
  check reactive to the LIVE window (re-fires when messages land), one
  attempt per (channel, oldest-unread) per entry, failure surfaces a
  notice naming the retry path.
- F7: upgrade sockets get an error guard BEFORE the first await (cli.js +
  hub_proxy.js), a 15s upstream handshake deadline (terminate + destroy),
  and the relay promise chain gained .catch. Verified by
  `scripts/ws_upgrade_probe.mjs`: real server + black-hole hub survived
  garbage-after-handshake, mid-handshake RST abort, and non-ws upgrades.
- F8: synchronous `new WebSocket()` constructor failure now re-arms the
  retry loop (used to kill live updates until relaunch).
- F9: empty rail names its state ("Loading…" vs "hub unreachable, retrying")
  instead of rendering blank.

Gate: 309 tests green, build clean, F7 probe green.

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context

The operator's "I have to relaunch continuum or messages won't display"
complaint (dm 99) got a six-cause adversarial audit; the P0/P1 core fixes
shipped same-day (sticky filter, pool starvation, seq-regression cursor,
dead mount, stale snapshots). This item is the deliberately deferred tail —
the remaining findings that keep the live path honest under partial
failure:

- **F5 (P1) stale-window backfill split**: the unread backfill effect mixes
  coverage checks with fetching; coverage must read LIVE messages and a
  failed backfill must surface (notice), not silently leave the Unread
  filter showing nothing.
- **F7 (P2) WS process-fatal guard**: `bin/hub_proxy.js` WebSocket upgrade
  path lacks a socket `error` handler and a handshake timeout — a hung or
  aborted upgrade can throw process-fatally or leak sockets.
- **F8 (P2) WS retry on error**: the client live-path retry treats an
  errored socket as terminal in one branch; reconnect must re-arm
  consistently.
- **F9 (P2) missing rail-row notice**: when a channel row can't render
  (unknown/failed fetch), the rail shows nothing — a labeled degraded row
  beats silence.

## Acceptance

- Backfill failure shows a visible notice and the Unread tab never renders
  an empty pane while unread messages exist outside the window.
- Proxy survives a malformed/hung WS upgrade (probe: open a raw socket to
  the WS path, send garbage, wait; process stays alive).
- Client WS reconnects after a socket error (probe: kill/restart hub).
- Tests green; changelog entry.
