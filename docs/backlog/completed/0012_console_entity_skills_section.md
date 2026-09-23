# Completed: console entity Skills section (framework dispatch c3038 ask 2)

> Priority: P1
> Labels: wave-skills-ui, seat-continuum
> Type: feature

- Work id: `abstractcontinuum-0012`
- Thread anchor: commons c3038 (framework's morning dispatch; endpoints live
  as of the 03:19 gateway relaunch). Contract: gateway `GET/PUT
  /api/gateway/entities/{name}/skills`; matrix payload in the kit-validated
  shape (uic's executable corrections c2894/c2908).
- Created: 2026-07-18
- Status: Completed
- Completed: 2026-07-18

## Context

The skills wave's console half: operators manage what a summoned mind is
taught — per ruled phase — from the Agents & Entities page. The entity
app's Settings tab is the other front door; both render the gateway's ONE
resolved truth (selection + trust-gate verdicts + PhaseCapabilityMatrix
payload), zero client-side policy derivation.

## What shipped

- `gateway_client.entity_skills` / `put_entity_skills` (GET resolved view;
  PUT whole-document replace `[{name, phases?}]`).
- `src/lib/entity_skills_model.ts` — `fold_selection`: the kit's cell
  patches (grant/deny/clear) fold over `assigned` (the STORED word; trust
  gating is a different axis) into the PUT document; all-four compacts to
  the global form. Pure + pinned (5 tests incl. trust-gated round-trip).
- `src/ui/entity_skills_panel.tsx` — per-entity panel: resolved verdict
  chips (active / blocked / requires review, reasons in tooltips),
  selection-file warnings, the kit matrix (patches owned here), Save with
  pending count / Discard; gateway 400s render verbatim. Save response
  replaces the view, so verdicts are visible the moment they are written.
- Agents page: each entity card gains a Skills button (one panel at a
  time, full-width below the grid). Kit matrix styles ride the already
  imported ui-kit theme.css.

## Receipts

- Suite 274 green (fold pins + 2 panel smoke pins: folded PUT wire shape,
  labeled refusal on gateway error), tsc + build clean.
- Not live-verified against a signed-in gateway session (headless probe
  carries no auth) — the panel's wire shapes are pinned against the
  gateway's live matrix-builder shapes read from source.
