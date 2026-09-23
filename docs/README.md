# AbstractContinuum documentation

Continuous iterative development and deployment console for
AbstractFramework — the development cockpit over a Run Gateway.

## Core docs

| Page | What it covers |
| --- | --- |
| [getting-started.md](getting-started.md) | Install, first run (dev + production shape), your first execution |
| [architecture.md](architecture.md) | System shape (diagrams), the exec pipeline, module layout, design boundaries |
| [api.md](api.md) | The gateway API families this app consumes + the session endpoints it serves |
| [configuration.md](configuration.md) | Server env vars, session-proxy knobs, gateway-side feature gates, browser settings |
| [security.md](security.md) | Trust model — the process manager and promote-to-prod are high trust; read before deploying |
| [conventions.md](conventions.md) | The board's work-item grammar: lifecycle, metadata lines, type enum, DoR/DoD, supervision labels — the canonical reference process skills teach from |
| [faq.md](faq.md) | Recurring questions (observer vs continuum, executor agnosticism, UAT vs inplace, …) |
| [troubleshooting.md](troubleshooting.md) | Symptom-oriented fixes for sign-in, executions, inbox, processes, and dev setup |

## Root docs

- [../README.md](../README.md) — overview and quick start
- [../CHANGELOG.md](../CHANGELOG.md) — release history
- [../SECURITY.md](../SECURITY.md) — the short-form trust statement
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — development workflow and conventions
- `../history.md` — provenance: the 2026-07-12 observer split (maintainer-facing)

## Planning

- [backlog/overview.md](backlog/overview.md) — the work backlog (planned /
  proposed / completed / recurrent) with its operating rules
