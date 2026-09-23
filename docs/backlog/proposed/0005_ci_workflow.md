# Proposed: CI workflow (typecheck + tests + build on push/PR)

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The repo has no `.github/` yet — it also has no commits (the standing
maintainer rule gates the first commit on his word). Once the repo has a
remote, the three local gates (`npx tsc --noEmit`, `npm test`,
`npm run build`) should run on every push/PR.

## Current code reality
- 62 vitest tests, tsc clean, vite build green — all local-only.
- Sibling apps use GitHub Actions with npm trusted publishing (the `cicd`
  skill's shape).

## Problem or opportunity
Without CI, regressions ride green locally-only claims.

## Proposed direction
`ci.yml` (node 20: install, tsc, vitest, build) + a `release.yml` gated on
tags when the maintainer decides to publish. Note the `file:` app-server
dependency (backlog 0001) must resolve before CI can install from a bare
checkout — either publish first or vendor a stub for CI.

## Promotion criteria
First commit lands / the maintainer green-lights repo setup.

## Validation ideas
- CI run on a scratch branch; intentionally failing test to prove gating.

## Non-goals
- Publishing decisions (maintainer's call).
