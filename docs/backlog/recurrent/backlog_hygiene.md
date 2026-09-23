# Recurrent: backlog and docs hygiene

## Metadata
- Created: 2026-07-12
- Status: Recurrent
- Completed: N/A (runs repeatedly)

## Purpose
Keep `overview.md` counts/ledgers truthful, filenames compliant
(`NNNN_slug.md`, globally unique numbers, no dates), and docs aligned with
code after every wave of work.

## Run conditions
After completing, moving, or adding items; after any change to
`src/lib/gateway_client.ts` or the page set (docs/api.md and
docs/architecture.md must track them); monthly fallback.

## Checklist
- [ ] Counts in `overview.md` match the lifecycle directories.
- [ ] Every item appears in exactly one ledger with a working link.
- [ ] No duplicate or date-prefixed item numbers.
- [ ] `docs/api.md` matches the client's actual method set.
- [ ] `docs/architecture.md` module layout matches `src/`.
- [ ] CHANGELOG carries user-visible changes since the last pass.

## Expected output
Updated overview/docs in the same pass; a one-line planning note when
anything material moved.

## Non-goals
Rewriting history: completed/deprecated reports are append-only.
