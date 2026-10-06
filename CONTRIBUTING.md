# Contributing

AbstractContinuum is a Vite + React + TypeScript app (snake_case files,
strict TS, vitest). It is a thin client: all state lives on the Run
Gateway; the app renders and commands it.

## Setup

```bash
npm install
npm run dev      # dev server on :3002, /api proxied to the configured gateway
```

`@abstractframework/ui-kit`, `@abstractframework/panel-chat` and
`@abstractframework/app-server` are npm dependencies (`npm install` fetches
them); no other checkout is needed.

## Before you finish any change

```bash
npx tsc --noEmit   # typecheck
npm test           # vitest: model pins + jsdom component tests
npm run build      # production build must stay green
npm run check:lock # package-lock.json matches package.json (see below)
```

## Lockfile check

`npm run check:lock` runs `scripts/check_lock.mjs`, and CI runs it before `npm ci`. It
fails when `package-lock.json` lags `package.json` (the lock's root entry records a different
dependency spec: `package.json` was edited without `npm install`), and when an
`@abstractframework/*` dependency (`ui-kit`, `panel-chat`, `app-server`, `monitor-*`) is missing
from the lock, resolves below the `package.json` floor or to another major.minor, comes from a
local `file:` tarball, or has a nested copy that differs from the top-level one. Fix it with
`npm install` (or `npm install @abstractframework/<name>@^<version>` to raise a floor) and commit
both files.

At release time, `npm run check:lock -- --latest` also fails when npm has a newer patch of an
`@abstractframework/*` dependency than the lock resolves (needs the network).

```bash
npm run check:lock
```

## Layout

- `src/lib/` — the typed gateway client (development-lane API families
  only; see `docs/api.md`).
- `src/ui/backlog/` — the backlog + exec pipeline modules (keep files under
  ~600 lines; `model.ts` stays pure and unit-pinned).
- `src/ui/board/` — the Board (kanban model, drawer, work claims).
- `src/ui/` — the other pages (executions, agents, team, report inbox,
  email, services, settings), the backlog folder panel, and small shared
  widgets.
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
- Documentation changes regenerate `llms.txt` / `llms-full.txt` in the same
  change (see [docs/conventions.md](docs/conventions.md#docs-freshness)):
  edit `llms.txt` by hand, then run `node scripts/gen_llms_full.mjs`
  (`--check` reports a stale file).

## See also

- [docs/architecture.md](docs/architecture.md) — components and boundaries
- [docs/api.md](docs/api.md) — the gateway families the client may call
- [CHANGELOG.md](CHANGELOG.md) — add a user-visible entry for behavior changes
- [SECURITY.md](SECURITY.md) — the trust model your change must keep
