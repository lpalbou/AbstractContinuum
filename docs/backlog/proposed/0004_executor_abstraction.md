# Proposed: first-class executor abstraction (beyond codex)

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: Needs new ADR when a second executor lands (naming + config
  contract would become durable cross-package policy, co-owned with the
  gateway seat)

## Context
Maintainer direction at the seat's creation (2026-07-12): "the agents
powering this continuous development of the framework will probably change.
codex is just a nice agent we can leverage headless for the moment" — with
`abstractcode` named as a plausible successor.

## Current code reality
- The UI is already executor-agnostic where it could be: the Executions
  page renders the executor label from `/backlog/exec/config` (`executor`
  field); model/effort come from the same config.
- Remaining codex-shaped edges (all gateway-owned contracts the UI merely
  reflects): config field names `codex_bin`/`codex_model`/
  `codex_reasoning_effort`; the events JSONL shape parsed by
  `exec_event.ts` (codex CLI event format: `item.type`,
  `command_execution`, `usage` tokens); setup copy in the execute modal
  naming `ABSTRACTGATEWAY_BACKLOG_CODEX_*` env vars.

## Problem or opportunity
When a second executor arrives, the event format and config fields need a
neutral contract or a per-executor adapter, or the live log view degrades
to raw text for non-codex executors.

## Proposed direction
1. Gateway-side (their lane): a neutral executor config shape
   (`executor_id`, `binary`, `model`, `reasoning`) with the codex fields as
   aliases; a documented event envelope or per-executor event schema tag.
2. Continuum-side: an executor-aware event parser registry keyed by
   `executor_type` (today: `codex_cli` → current parser; unknown → raw
   lines with `#FALLBACK` labeling), and copy that never hardcodes an agent
   name.

## Cross-seat data on record (2026-07-12)
- Observer (commons c1054): the QA verbs (promote / deploy-UAT) were built
  against gateway endpoints that assume the CODEX REQUEST LAYOUT (run dirs,
  candidate/manifest relpaths) — the executor seam therefore includes an
  endpoint-contract conversation with the gateway, not just event parsing.
  Also: the marker-imitation rule applies to any executor — render
  tool/ledger truth, never the executor's own prose claims.
- Skill seat (commons c1055): capability parity on process skills already
  exists for the named candidate — abstractcode activates the same curated
  pack (backlog, cicd, adr, review, coredoc, …) through its trust gate that
  codex reads from `~/.codex/skills`; catalog at
  `abstractskill/docs/skills-catalog.md`. The seam design can assume skill
  parity travels with the executor swap.

## Why it might matter
This package's long-term mission is owning framework development flow; the
executor is its central dependency and must stay swappable.

## Promotion criteria
A second executor becomes concrete gateway-side, or the gateway seat
proposes the neutral config/event contract.

## Validation ideas
- Fixture logs from each executor through the parser registry; unknown
  executor renders raw with the fallback label.

## Non-goals
- Building executor adapters speculatively before a second executor exists.
