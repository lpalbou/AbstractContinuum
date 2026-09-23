# Completed: board-first redesign (maintainer-directed, 2026-07-12)

## Metadata
- Created: 2026-07-12
- Status: Completed
- Completed: 2026-07-12

## ADR status
- Governing ADRs: None
- ADR impact: None (the design doc records the ruled semantics)

## Context
Maintainer directive (with a broken sign-in screenshot as the trigger):
completely redesign the app — layout, categories, components — drawing on
kanban/scrum tools; think agent recruitment/assignment, labels,
priorities, work types, expected outcomes/tests, and ENFORCED engineering
practice; use the shared abstractuic components (auth especially); three
fable5 adversaries. Design: `docs/design/redesign_2026_07.md`.

## What was done
1. **Auth fixed at the root**: the "Not Found" was the Vite dev server
   lacking the session proxy — now mounted as a dev plugin (dev = prod
   flow); the homegrown sign-in form replaced by uic's
   GatewayConnectModal + GatewaySessionSignInCard.
2. **New IA**: sidebar shell (Board · Executions · Backlog · Agents ·
   Inbox · Services · Settings), Board as landing.
3. **Board**: kanban derived from gateway state (batch-aware busy set via
   active_items; status-scoped fetches; one source per column; Failed =
   history with Ready badges), drag Triage↔Ready, label facets with a
   coverage pill, priority chips/sort, work-item drawer (Spec/Runs/Review
   with kind resolution, snapshot warning, two-step promote).
4. **Discipline**: metadata convention (`> Priority:`, `> Labels:`,
   sprint-N labels), DoR gate with parse evidence + explicit unknown state
   + labeled override, DoD checklist; server-side gate + list metadata +
   promote-carry + agent assignment filed as gateway asks (c1087/c1088).
5. **Agents page**: roster + counts-based track record; executor stays a
   pluggable seam.
6. **Three adversary folds** recorded in the design doc (§10b pre-build,
   §10c post-build) — every P0/P1 fixed same-day, with pins for the
   adversary-ranked top-3 untested behaviors.

## Validation
- 101 tests green (`npx vitest run`), `npx tsc --noEmit` clean,
  `npm run build` green, production-server smoke green, dev-proxy sign-in
  smoke green (bad creds → gateway error, not 404).
- All modules < 600 lines.

## Completion report

> Completed: 2026-07-12

### What changed
See "What was done"; user-visible summary in CHANGELOG 0.2.0.

### Follow-ups
- 0008 (gateway list metadata + promote-carry), 0009 (server DoR +
  assignment) — consumption items for the filed asks.
- uic asks: dev-proxy pattern blessing + nav icons + board primitives
  offer (commons c1086); c1073 adoption still open.
- "improvement" work-type vocabulary — gateway/template enum question
  raised on the gateway thread.
- UX P2 backlog from adversary 3 (first-run empty states, chip density,
  4K centering, a11y pass on card semantics) — candidates for the next
  wave.
