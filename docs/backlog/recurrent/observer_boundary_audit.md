# Recurrent: purpose-boundary audit (observer vs continuum)

## Metadata
- Created: 2026-07-12
- Status: Recurrent
- Completed: N/A (runs repeatedly)

## Purpose
Protect the split's purpose boundary: the observer observes and discusses;
continuum develops and deploys. Neither app grows the other's features.

## Run conditions
After any feature addition here; whenever this app starts consuming a new
gateway API family; when the observer seat announces feature moves.

## Checklist
- [ ] No observation-lane features grew here (run ledger browsing, KG/memory
      views, entity surfaces, artifact browsing beyond exec logs).
- [ ] `gateway_client.ts` gained no observation-lane families; shared reads
      stay limited to the documented set (runs probe, artifact download,
      voice, attachments).
- [ ] Nothing development-lane leaked back into the observer (check their
      client's marker comment / announcements).
- [ ] If a boundary question is live, it was asked on agora (owning seat)
      instead of building a second copy.

## Expected output
Either "boundary clean" in the pass note, or a filed backlog item / agora
ask for anything that crossed.

## Non-goals
Policing the observer's repo — raise findings with their seat; only this
repo gets edited here.
