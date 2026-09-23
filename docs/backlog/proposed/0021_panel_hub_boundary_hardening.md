# Proposed: panel-hub boundary hardening (agora web-chat extraction prep)

## Metadata
- Created: 2026-07-21
- Status: Proposed (origin: laurent's 2026-07-21 directive — "repackage the
  team page to become a web chatui for agora"; joint design with the agora
  seat, dm:agora--continuum #36-41)
- Completed: N/A

## Context

Two fable5 audits + agora's identity adversary converged (unanimous):
the hub stays protocol-pure and bearer-only; the Team page extracts as a
shared LIBRARY (`@abstractframework/panel-hub` in abstractuic, beside
panel-chat) consumed by BOTH the console and a thin `agora-chat` npm
shell — one source, two shells; the seat-key node proxy stays the browser
path. Deciding facts: one gateway call inside 4,500 lines (the AI
advisor), 4 React-only kit components, hub kernel already seam-clean.

## Scope (the ~1-day prep that is pure upside under every outcome)

1. Make the Team page's `GatewayClient` dependency an injected OPTIONAL
   interface (`advisor?: (question, history) => Promise<string>`) — AI
   chips hide when absent; the gateway type import disappears.
2. Verify the slice imports nothing console-specific (team_page,
   team_model, hub_client, hub_ledger, work_id, file_viewer, memo_markdown,
   error_boundary).
3. Coordinate publishing `@abstractframework/app-server` (uic seat) — the
   one unpublished file: dep blocking any packaging path.
4. The extraction itself (library move + shell) is a SEPARATE later item,
   gated on laurent green-lighting the product (audience beyond himself)
   and on agora's generated-TS-client landing (panel-hub consumes it
   instead of hand-kept hub_client.ts shapes).

## Acceptance

- Team page renders with zero gateway props (AI affordances hidden).
- No @abstractframework import in the slice beyond the 4 kit components.
- app-server publish coordinated (or its blocker named on the record).
