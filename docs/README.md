# AbstractContinuum documentation

Continuous iterative development and deployment console for
AbstractFramework — the development cockpit over a Run Gateway
(AbstractGateway 0.4.1 or newer). Start with
[getting-started.md](getting-started.md), then read the page that matches
your task below.

## Core docs

| Page | What it covers |
| --- | --- |
| [getting-started.md](getting-started.md) | Install, first run (dev + production shape), your first execution |
| [architecture.md](architecture.md) | System shape (diagrams), the exec pipeline, module layout, design boundaries |
| [api.md](api.md) | The gateway API families this app consumes + the session endpoints it serves |
| [configuration.md](configuration.md) | Server launch flags and settings file, sign-in proxy settings, Team page hub seat, gateway settings (backlog folder, exec runner, executor, process manager), browser settings |
| [security.md](security.md) | Trust model — the process manager and promote-to-prod are high trust; read before deploying |
| [conventions.md](conventions.md) | The board's work-item grammar: lifecycle, metadata lines, type enum, DoR/DoD, supervision labels — the canonical reference process skills teach from |
| [faq.md](faq.md) | Recurring questions (which version you run (About), observer vs continuum, executor agnosticism, UAT vs inplace, …) |
| [troubleshooting.md](troubleshooting.md) | Symptom-oriented fixes for sign-in, the About dialog, executions, the backlog folder, inbox, services, the Team page, and dev setup |

## Design

- [design/redesign_2026_07.md](design/redesign_2026_07.md) — the
  board-first design the pages follow (Board, Executions, Backlog, Agents)

## Root docs

- [../README.md](../README.md) — overview and quick start
- [../CHANGELOG.md](../CHANGELOG.md) — release history
- [../SECURITY.md](../SECURITY.md) — the short-form trust statement
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — development workflow and conventions
- `../history.md` — provenance: the 2026-07-12 observer split (maintainer-facing)

## Planning

- [backlog/overview.md](backlog/overview.md) — the work backlog (planned /
  proposed / completed / recurrent) with its operating rules
