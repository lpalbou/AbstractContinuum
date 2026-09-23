# Completed: unified work system S3 — board claim-join + Team work-id chips

> Priority: P2
> Labels: wave-unified-work, seat-continuum
> Type: feature

- Work id: `abstractcontinuum-0011`
- Thread anchor: commons c3014 → c3019 (framework's orchestration, card `abstractframework-0017`); ruling `decision:work-item-vocabulary` (S0), vote `decision:unified-work-system-vote` (Option A 11-0, c3010).
- Created: 2026-07-18 (retro-minted at completion — the slice predates the
  process it implements; header-on-next-touch migration per S1's teaching)
- Status: Completed
- Completed: 2026-07-18

## Context

Option A (file-as-state, one id, two planes) won the operator-ordered vote
11-0. S3 is continuum's slice: render the seat-work half of the join — a
planned backlog file with a live hub pointer claim is *in-progress*, and
work-id mentions on the Team page link to the Board. The rendered words
(`in-progress`, `in-review`) are continuum's owned closed set (S0
governance): pure derivations over file+claim+receipt, never stored.

## What shipped

- `src/lib/work_id.ts` — the S0 grammar (`<package>-<NNNN>`, last-hyphen
  parse), `work_id_for_item` (filename → id), `extract_work_ids` (prose
  mentions; head ≥ 4 chars after a live `pre-0049` false positive),
  `derive_work_state` (the rendered words as pure functions), and
  `claim_age_label` (the S4 staleness fold, v1 = claim age).
- Proxy: read-only store routes (`GET /channels/{c}/store[/{key}]` — the
  vote's annotation lane; writes stay `channel:meta`-only) + `GET
  /work/{id}` (agora 0093), all allowlist-pinned.
- `use_work_claims` — one store-keys listing per 30s poll, values fetched
  only on version change (version-keyed cache); any refusal disables the
  lane for 5 minutes and the board renders exactly as before.
- `apply_work_claims` (board_model) — planned + live claim ⇒ In Progress
  with a `⛏ owner · age` chip (stale ⇒ warn, titled with the re-claim
  rule); exec-attempt cards always win (the attempt is the stronger
  signal). Column hints updated to name the two layers.
- Team page: `<package>-<NNNN>` mentions render as chips → Board filtered
  to the item (one-shot search preset through the app shell).

## Receipts

- Suite 267 green (12 work_id pins + 3 join pins + allowlist pins), tsc
  clean, build clean.
- Live-verified headlessly: commons renders 7 work-id chips (all real
  ids), chip click lands on the Board with the search preset; board
  renders unchanged with the claims lane feature-absent (old proxy).
- Receipt message: commons, on the orchestration thread (c3019 chain).

## Honest gates (what lights up when)

- Claims join + store reads: activate at the next **console restart**
  (the running process predates the proxy routes).
- `in-review` + the drawer's /work activity: activate at the next **hub
  bounce** (0.12.12 carries `GET /work/{id}`); until then receipts are
  unknown and the derivation honestly never fabricates a review state.

## Follow-ups

- Work-item drawer: /work activity block (claims, decisions, citing
  messages) once the hub serves it — one call per drawer open.
- In-review column join from /work receipts (same gate).
- Full S4 staleness predicate (file-unchanged AND no-receipts) once
  receipts are readable — v1 renders claim age only.
