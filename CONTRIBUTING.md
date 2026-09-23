# Contributing

AbstractContinuum is a Vite + React + TypeScript app (snake_case files,
strict TS, vitest). It is a thin client: all state lives on the Run
Gateway; the app renders and commands it.

## Setup

```bash
npm install
npm run dev      # dev server on :3003, /api proxied to localhost:8080
```

The dev toolchain resolves `@abstractframework/ui-kit` and
`@abstractframework/panel-chat` from a sibling `../abstractuic` checkout
(see `vite.config.ts` aliases) and `@abstractframework/app-server` via a
`file:` dependency. Clone `abstractuic` next to this repo.

## Before you finish any change

```bash
npx tsc --noEmit   # typecheck
npm test           # vitest: model pins + jsdom component tests
npm run build      # production build must stay green
```

## Layout

- `src/lib/` — the typed gateway client (development-lane API families
  only; see `docs/api.md`).
- `src/ui/backlog/` — the backlog + exec pipeline modules (keep files under
  ~600 lines; `model.ts` stays pure and unit-pinned).
- `src/ui/` — pages (executions, report inbox, email, processes) and small
  shared widgets.
- `bin/cli.js` — static serving + the app-origin gateway session proxy.
- `bin/hub_proxy.js` — the Team page's allowlisted agora hub proxy.
- `vendor/hub/` — the vendored hub OpenAPI artifact and golden vectors that
  `src/lib/hub_contract.ts` and `src/lib/hub_conformance.test.ts` pin
  against (`npm run gen:hub-types` regenerates `src/lib/hub_api_types.ts`).

## Conventions

- One file, one concern; pure logic goes to `model.ts`-style modules with
  unit tests; React modules stay presentational or single-hook.
- Behavior changes need a test in the same change; refactors need pins
  written BEFORE the refactor.
- Degraded paths warn with `#FALLBACK`; UI truncation is labeled
  `#TRUNCATION`.
- Do not grow observation features here — the observer app owns watching
  and discussing the running system; this app develops and deploys it.
- Work items live in `docs/backlog/` (see `docs/backlog/overview.md`).
