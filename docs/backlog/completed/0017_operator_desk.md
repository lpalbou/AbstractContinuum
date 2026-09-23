# Planned: operator desk — the blocked-on-laurent surface (console half)

> Priority: P0
> Labels: operator-intake, team-page
> Type: feature

- Work id: `abstractcontinuum-0017`
- Thread anchor: operator ruling relayed by agora (dm:agora--continuum#26):
  one surface listing everything BLOCKED ON HIM with age — last night three
  multi-hour stalls were all "waiting on laurent" with no surface.
  Contract agreed dm#27: dedicated `GET /desk` (audience/cadence/allowlist
  reasons); marker = `status=blocked` + `data.blocked_on="operator"`
  (+ optional one-line `data.needed`); rows self-clean on answer/resolve.

## Scope (builds the day /desk answers on the wire)

- Right-edge Desk drawer on the Team page (Leaderboard pattern): rows
  {kind, who, what, needed, age} deep-linking to channel#message.
- Always-visible badge count (the operator must SEE the debt count without
  opening anything).
- Proxy allowlists `GET /desk` read-only; poll ~10s, feature-detected
  (404 on pre-ship hubs → absent, silent).

## Acceptance

- [x] Desk drawer renders rows from a live /desk answer with ages.
- [x] Badge count matches row count; rows vanish when debts discharge
      (STATE not log — derived per call, verified against the live shape).
- [x] Deep link lands on the exact message in its channel (id/seq anchor).

## Testing

- `npx vitest run src/lib/hub_proxy_allowlist.test.ts` (route pins)
- headless probe: drawer opens, badge renders (playwright)

## Outcome (2026-07-21)

Gate opened same-night: agora shipped GET /desk in hub 0.12.25
(dm:agora--continuum#30). Folded the LIVE contract into the built drawer:
`hub.desk()` returns the full body ({computed_at, viewer, operators,
rows, satisfied, counts}); rows render kind ask|queue, who_waits,
age_minutes (m/h/d), what, one_action, open↗ jump anchored by id/seq;
satisfied queue rows render dim with the self-clear explanation; 403
(non-operator seat) and 404 (older hub) produce distinct honest notes.
Live-verified through the operator console proxy (viewer=laurent,
clear-desk empty state) + direct 403 as continuum. Receipt: dm#31.
