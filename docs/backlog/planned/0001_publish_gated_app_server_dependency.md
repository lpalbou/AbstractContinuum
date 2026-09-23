# Planned: swap the file: app-server dependency to a published semver range

## Metadata
- Created: 2026-07-12
- Status: Planned
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
`package.json` depends on `"@abstractframework/app-server": "file:../abstractuic/app-server"`
— the shared app-origin gateway session proxy. The observer app carries the
identical publish-gated dependency; both swap to a semver range when the
uic seat publishes the package. Labeled debt #5 in `history.md`.

## Current code reality
- `package.json` dependencies: `file:../abstractuic/app-server`.
- `bin/cli.js` imports `createGatewaySessionProxy` from it (appId
  `abstractcontinuum`).
- `npm pack`/publish of this app is broken until the dependency resolves
  from a registry.

## Problem
The app cannot be installed standalone (`npx @abstractframework/continuum`)
while the dependency points at a sibling checkout.

## What we want to do
Replace the `file:` specifier with the published version range once
`@abstractframework/app-server` is on npm, then verify `npm install` from a
clean directory and `npm start` against a gateway.

## Scope
- One `package.json` line + lockfile refresh + a clean-install verification.

## Non-goals
- Publishing this app itself (maintainer's call, separate release process).

## Dependencies and related tasks
- uic seat publishing `@abstractframework/app-server` (they own timing).

## Expected outcomes
- `npm install` works without a sibling `abstractuic` checkout for the
  runtime path (dev-time ui-kit aliases may still want the sibling).

## Validation
- `npm pack` then install the tarball in a temp dir; `node bin/cli.js`
  serves and signs in against a local gateway.

## Progress checklist
- [ ] app-server published (watch the uic seat's announcements)
- [ ] swap specifier + lockfile
- [ ] clean-install verification
