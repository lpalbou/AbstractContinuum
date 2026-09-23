# Completed: CI workflow (typecheck + tests + build on push/PR)

## Metadata
- Created: 2026-07-12
- Status: Completed
- Completed: 2026-09-23

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

## Completion report

- Date: 2026-09-23
- `.github/workflows/ci.yml`: on push/PR to `main`, checks out this repo
  and `lpalbou/AbstractUIC` side by side (the `file:` app-server dependency
  and the ui-kit/panel-chat aliases resolve from `../abstractuic`), then
  `npm ci`, an app-server resolution check, `npm test`, `npm run build`
  (tsc + vite), a CLI `--version`/`--help` smoke test, and
  `npm pack --dry-run`.
- `.github/workflows/release.yml`: on `v*` tags, the same gates plus a
  refusal of `file:`/`link:`/`workspace:` dependency specs and a tag ==
  `package.json` version check, then `npm publish --access public
  --provenance` over OIDC (skipped when the version is already on npm) and
  a GitHub release whose notes are the matching CHANGELOG section.
- Validation: the same steps were run locally in a runner-shaped layout
  (fresh clones of both repos as siblings) before the first push; the first
  `ci.yml` run on `main` is the remote proof.
- Remaining: npm cannot create a new package name over trusted publishing,
  so the first publish is manual (see backlog 0001 for the app-server
  dependency swap that must precede it).
