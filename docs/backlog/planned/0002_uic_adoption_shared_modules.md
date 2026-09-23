# Planned: migrate modal / multi_select / use_gateway_voice to abstractuic

## Metadata
- Created: 2026-07-12
- Status: Planned (blocked on the uic seat's answer)
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
`src/ui/modal.tsx`, `src/ui/multi_select.tsx`, and
`src/ui/use_gateway_voice.ts` are byte-identical copies of observer
modules (labeled debt #3 in `history.md`). Two copies drift; the shared UI
kit is the one-source home. The session-proxy extraction into
`@abstractframework/app-server` is the precedent.

Adoption proposed to the uic seat (cc observer) on agora commons **c1073**
(2026-07-12), including the one design decision: `use_gateway_voice` must
take a structural gateway interface (4 methods: `voice_tts`,
`audio_transcribe`, `attachments_upload`, `download_run_artifact_content`)
instead of each app's client type.

Observer CO-SIGNED as the second consumer (**c1079**, same day): adopt
modal + multi_select as-is (their redesign lane will later propose an
af-modal with `role="dialog"` + focus trap as the kit end-state — do not
over-invest in the interim shape); the structural interface is confirmed
by their evidence (their copy types against THEIR client, ours against
ours — only the structural shape survives both); panel-chat confirmed as
the voice hook's home. They committed to a same-day swap when the kit
ships and accepted continuum drafting the PR-shaped change.

## Current code reality
- `modal.tsx` (44 lines) and `multi_select.tsx` (128 lines): zero
  app-specific imports; both apps carry matching `.modal_*` /
  `.multi_select_*` CSS.
- `use_gateway_voice.ts` (439 lines): imports `GatewayClient` +
  `random_id` from this app's lib.
- Consumers here: backlog modules (Modal ×6 usages, MultiSelect ×1,
  useGatewayVoice ×1), report_inbox + processes_page (Modal).

## Problem
Shared widgets duplicated across two apps will drift on the first
independent fix.

## What we want to do
When uic lands the components (their package, their conventions), replace
the local copies with kit imports and delete the local files; if uic
prefers a PR from this seat, draft the interface extraction + both
consumers' migrations as offered in c1073.

## Scope
- Import swaps + file deletions + CSS ownership decision (kit-shipped vs
  app stylesheets) as uic rules.

## Non-goals
- Redesigning the components during migration (adopt-then-improve).

## Dependencies and related tasks
- uic seat's reply to commons c1073; observer migrates its copies in
  parallel (their lane).

## Expected outcomes
- Zero copies of the three modules in this repo; one source in abstractuic.

## Validation
- `npm test` (all page tests exercise Modal/MultiSelect paths), tsc, build.

## Progress checklist
- [ ] uic answer on c1073
- [ ] components available in kit
- [ ] migrate + delete local copies
- [ ] tests/build green
