# Completed: birth cleanup wave (prune copies, split monolith, first-class pipeline, bootstrap)

## Metadata
- Created: 2026-07-12
- Status: Completed
- Completed: 2026-07-12

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The repo was born 2026-07-12 from the observer split carrying six labeled
debts (`history.md`): the full observer gateway client, the full observer
stylesheet, three copied shared modules, no live pipeline surface, a
publish-gated dependency, and no docs/CI. This wave was the seat's first
task: clean the inherited code and bootstrap the repo.

## What was done

1. **Client prune** — `gateway_client.ts` 1,903 → ~750 lines: only the
   development-lane families remain (backlog + exec, reports/email/triage,
   processes, shared reads); types moved to `gateway_types.ts`; transport
   deduplicated behind `_get_json`/`_post_json`/`_post_form`. Deleted
   orphaned `lib/types.ts`, `lib/sse_parser.ts`.
2. **CSRF fix (found during the prune)** — the copied client read the
   OBSERVER's CSRF cookie and sent the observer's header; same-origin
   mutations would all 403. Now `abstractcontinuum_gateway_csrf` →
   `x-abstractcontinuum-csrf` + canonical `x-abstract-csrf`.
3. **CSS prune** — `styles.css` 6,026 → ~1,300 lines via a postcss script
   (`scripts/prune_styles.mjs`): a selector survives iff every class it
   mentions is used by our pages (dynamic status classes allowlisted;
   `pc-*` panel-chat internals kept); unreferenced keyframes and emptied
   media blocks dropped.
4. **Identity fixes** — report client id `abstractcontinuum/web`; email
   account + advisor voice storage keys moved off the observer's names.
5. **Monolith split** — `backlog_browser.tsx` 4,141 lines → 14 modules
   under `src/ui/backlog/` (largest 600 lines), state split into
   `use_backlog_items` + `use_exec_pipeline`, panes presentational, page
   as composition root. Public path kept as a re-export.
6. **Pipeline first-class** — new Executions landing page reusing
   `use_exec_pipeline` + `ExecDetailPane`; endpoint gaps raised with the
   gateway seat (commons c1072) instead of client-side workarounds.
7. **Bootstrap** — full docs set (architecture with mermaid, api,
   configuration, security with the high-trust statement, faq,
   troubleshooting), CHANGELOG, LICENSE/SECURITY/CONTRIBUTING/
   ACKNOWLEDGEMENTS/CODE_OF_CONDUCT, llms.txt, this backlog.

## Validation
- Pins written BEFORE the split: 28 model unit tests + 7 page-level
  component pins against the monolith, passing unchanged after the split.
- Suite at completion: 72 tests green; `npx tsc --noEmit` clean;
  `npm run build` green after every slice; production-server smoke
  (`bin/cli.js`: index, session endpoint, assets) green.
- Two adversarial fable5 reviews folded (see the completion report below).

## Adversarial review fold (both reviews, 2026-07-12)

Adversary A (code, initial verdict BLOCK) — all P0/P1 fixed, most P2s:
- P0: the shell root `.app` had NO stylesheet rule (the copied stylesheet
  only carried the observer's `.app-shell`) — pages taller than the
  viewport were clipped, unscrollable. Fixed + pinned in styles.test.ts;
  `.brand`/`.tag` styled too.
- P1: `panel_chat.css` was never imported (all markdown/chat surfaces
  unstyled) — imported in main.tsx; bundle grew 61→75 kB confirming.
- P1: state-based in-flight guards were dead closures inside the polling
  intervals — with the new cursor follow, overlapping polls could
  double-append deltas. Converted to ref guards + concurrency pin.
- P1: promoted requests rendered two "Promotion" sections — gated +
  render pin added.
- P2s folded: terminal requests no longer tail-poll forever; live age
  ticks (memo removed); failed list polls keep the previous list; promote
  passes its destination view explicitly.
- P2s deliberately NOT taken: retained dead-CSS direction of the prune
  script (safety direction), `list_runs` narrowing (documented in api.md).

Adversary B (docs/product, verdict SHIP-WITH-FIXES) — all 3 P1 + P2s:
- api.md documented wrong sign-in body field names — corrected.
- README/getting-started now state the sibling `../abstractuic`
  requirement applies to install/build/start, not just development.
- The architecture state diagram wrongly showed inplace success skipping
  QA — corrected to both-modes-park-at-awaiting_qa (verified against the
  gateway runner).
- P2s folded: trust-proxy/Secure-cookie mechanism, "server-held session"
  wording, session lifetime (30d) + 0.0.0.0 bind + login-CSRF +
  audit-trail notes in security docs, module-layout drift, stale 0003 /
  changelog counts, error-contract precision.
- B independently confirmed: security claims mechanically true (P0 clean),
  purpose boundary clean, backlog integrity clean, the hypothesized
  "no sign-in UI" gap already closed during the wave.

## Completion report

> Completed: 2026-07-12

### What changed
See "What was done". Net: -8,000 lines of inherited copies, +tests, +docs.

### Follow-ups
- 0001 (publish-gated dependency), 0002 (uic adoption), 0003 (exec
  SSE/cursor), 0004 (executor abstraction), 0005 (CI), 0006 (attachment
  order quirk) — all filed with their evidence.
