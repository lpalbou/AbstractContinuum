# Proposed: consume server-side DoR gate + execute-time agent assignment

## Metadata
- Created: 2026-07-12
- Status: FULLY LANDED 2026-07-12 — gateway shipped the execute-time
  override (c1090) and the server DoR gate (c1140, to our c1124
  contract); both consumed client-side the same day. Ready to move to
  completed/ on the next backlog maintenance pass.
- Completed: 2026-07-12 (client consumption; server halves live)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Two enforcement/assignment halves of the redesign are honest client-side
stubs until the gateway accepts them:
1. The Definition-of-Ready gate on Execute is ADVISORY (client-parsed
   checklist + labeled override) — any curl bypasses it. c1088 ask 3
   proposes an execute-time `dor=check` that refuses (409 naming failing
   checks) unless `override=true`.
2. The Agents page shows the roster + track record but cannot ASSIGN:
   execute takes only `execution_mode` (gateway.py ~19388); target
   agent/model/reasoning are stamped from env config. c1087 ask 2 proposes
   optional validated `target_model`/`target_reasoning_effort` overrides.

## Current code reality
- `evaluate_readiness` + `ReadinessChecklist` (evidence-carrying checks);
  `ExecuteConfirmModal` labels failing-gate execution as an override.
- `agents_page.tsx` renders roster/stats; no picker (deliberate — the UI
  grows it the day the endpoint accepts overrides).
- DoD ticks are drawer-session-scoped, text-keyed; persistence would ride
  the exec request (mentioned in c1088; not yet a formal ask).

## Proposed direction
When the gateway ships: send `dor=check` + surface the 409's named checks
in the modal (override checkbox becomes the explicit `override=true`);
add the agent/model picker to the execute dialog + batch dialog; persist
DoD ticks on the request if the field lands.

## Landed 2026-07-12 (DoR gate half, c1140)
- `gateway_client` sends `dor=check` on every execute/execute_batch;
  `GatewayRequestError` carries status + parsed JSON body so structured
  refusals survive the transport.
- `readiness_from_dor_refusal` (board_model) converts the 409 into the
  modal's Readiness shape (batch member refusals fold flat with the
  member path prefixed). Duck-typed on {status, body} — any error
  transport works.
- Override discipline: first confirm never overrides; once the operator
  has SEEN a failing checklist (client-parsed or server 409), the
  "Execute anyway (override)" confirm sends `override=true` (recorded
  server-side as `dor_overridden`). Board + backlog single + batch flows
  all wired; pins in board_page.test.tsx (refusal → server checks →
  override) and board_model.test.ts (refusal parser).

## Landed 2026-07-12 (assignment half)
- `gateway_client.backlog_execute`/`backlog_execute_batch` accept
  `target_model` + `target_reasoning_effort` (omitted = gateway defaults,
  byte-unchanged behavior).
- `ExecuteConfirmModal` grew a collapsed `AgentOverrideSection` (free-form
  model + effort select). Deliberate design: the allowlist lives
  server-side (`ABSTRACTGATEWAY_BACKLOG_EXEC_ALLOWED_MODELS`); the UI
  renders 403 refusals verbatim and never second-guesses the gate.
- Batch dialog picker deferred until someone asks (endpoint is wired).

## Promotion criteria
Gateway answers the respective asks.

## Validation ideas
- Modal pins for 409-check rendering + override param; picker pins
  validated against the allowed set the gateway declares.

## Non-goals
- Client-side enforcement theater (claiming "enforced" while curl
  bypasses); multi-executor orchestration.
