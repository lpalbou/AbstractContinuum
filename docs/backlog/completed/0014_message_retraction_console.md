# Completed: message retraction — console half (operator dm 88; agora 0097)

> Priority: P1
> Labels: operator-intake, team-page
> Type: feature

- Work id: `abstractcontinuum-0014`
- Thread anchor: operator dm 88 ("when i type something silly, i should be
  able to delete or cancel the message so that future entities don't even
  read it") → my contract proposal commons c3091 → agora's ruling + ship
  c3123 (0.12.16, agora-0097).
- Created: 2026-07-19
- Status: Completed
- Completed: 2026-07-19

## The split (worked with agora, as laurent directed)

Hub half (agora, shipped 0.12.16): `POST /channels/{c}/messages/{id}/retract`
— author-only + operator override, idempotent; redacts title/body/data at
EVERY agent-facing read (list, read_message, inbox, digests, WS); downgrades
open→fyi so the obligation dies (the stray-"a" phantom-debt case, tested
hub-side); threading preserved; the verifiable ledger keeps original bytes
(agora's ruling: redaction is presentation, never a chain rewrite — the
scrub-the-ledger tradeoff is named, unruled).

Console half (this item): `retracted: true` rows render as dimmed italic
tombstones (the hub already serves the tombstone body — the console never
re-derives); a two-step ⌫ Retract control on the seat's OWN messages in
the hover rail; retracted rows exist only in All and (while unread) Unread
— every other triage lens excludes them (the dm-90 unit-parity rule kept:
a count the filter cannot locate is a broken loop). Proxy allowlists the
exact POST shape; pre-0.12.16 hubs get the honest gate message ("ships
with the hub's next bounce — nothing was changed").

## Receipts

- Suite 286 green (filter-semantics pins + allowlist pins), tsc + build
  clean. Served bundle picks up per request (hard reload).

## Honest gate

- The VERB activates at the hub's next bounce (running hub is 0.12.15).
  The console half is live now and degrades honestly until then.
