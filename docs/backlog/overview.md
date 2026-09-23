# AbstractContinuum backlog — overview

AbstractContinuum is the continuous development/deployment console for
AbstractFramework (split from the observer 2026-07-12; `history.md` at the
repo root records provenance and the debts inherited at birth). This
backlog is the durable planning memory for the package.

Note: this app also *renders* the framework-wide backlog served by the
gateway (`docs/backlog/` at the framework root). THIS directory is the
package-local backlog for abstractcontinuum itself — same conventions,
different scope.

## Counts

| State | Count |
| --- | --- |
| Planned | 2 |
| Proposed | 6 |
| Completed | 2 |
| Deprecated | 0 |
| Recurrent | 2 |

## Next recommended work

1. `planned/0002_uic_adoption_shared_modules.md` — blocked on the uic
   seat's answer (agora commons c1073); execute the migration when the kit
   lands the components.
2. `planned/0001_publish_gated_app_server_dependency.md` — swap the
   `file:` dependency when `@abstractframework/app-server` publishes.
3. `proposed/0003_exec_stream_and_log_cursor.md` — log-cursor half shipped
   and consumed 2026-07-12 (c1075/c1078); promote the SSE half when the
   gateway ships the stream (they committed to it post-fleet-leg).

## Planned

| ID | Item | Notes |
| --- | --- | --- |
| 0001 | `planned/0001_publish_gated_app_server_dependency.md` | Swap `file:../abstractuic/app-server` to a semver range on publish |
| 0002 | `planned/0002_uic_adoption_shared_modules.md` | Migrate modal / multi_select / use_gateway_voice to abstractuic once adopted |

## Proposed

| ID | Item | Promotion criteria |
| --- | --- | --- |
| 0003 | `proposed/0003_exec_stream_and_log_cursor.md` | Log cursor DONE (c1075, consumed same day); promote when the gateway ships exec-request SSE |
| 0004 | `proposed/0004_executor_abstraction.md` | A second executor (e.g. abstractcode) becomes concrete gateway-side |
| 0005 | `proposed/0005_ci_workflow.md` | Repo gets its first commit / publish decision from the maintainer |
| 0006 | `proposed/0006_attachment_insert_order_quirk.md` | Anyone confirms the intended order for repeated attachment uploads |
| 0008 | `proposed/0008_gateway_metadata_and_promote_carry.md` | Gateway ships list-level metadata / promote-carry (c1087/c1088) |
| 0009 | `proposed/0009_server_dor_gate_and_agent_assignment.md` | Gateway ships the execute-time DoR gate / agent overrides |

## Completed

| ID | Item | Completed | Outcome |
| --- | --- | --- | --- |
| 0007 | `completed/0007_birth_cleanup_wave.md` | 2026-07-12 | Client + CSS pruned, monolith split, Executions page, docs/tests bootstrapped (62 tests green) |
| 0010 | `completed/0010_board_first_redesign.md` | 2026-07-12 | Board-first redesign: uic auth (dev-proxy 404 fixed), sidebar IA, kanban + drawer, DoR/DoD, Agents page; 3 adversary folds; 101 tests green |

## Deprecated

None.

## Recurrent

| Task | Trigger |
| --- | --- |
| `recurrent/backlog_hygiene.md` | After completing/moving items; monthly fallback |
| `recurrent/observer_boundary_audit.md` | After any feature addition; when consuming new gateway families |

## Process

- **Adding items**: next unused global `NNNN` prefix (scan every lifecycle
  dir), `NNNN_snake_case_slug.md`, no dates in filenames. Planned items use
  the full template (context / current code reality / scope / non-goals /
  validation / ADR state); proposed items record promotion criteria.
- **Completing**: append a `## Completion report` (date, what changed,
  validation evidence), move to `completed/`, update this overview in the
  same pass.
- **Deprecating**: append a `## Deprecation report` with the reason; move to
  `deprecated/`.
- **ADRs**: this repo has none yet; if an item creates a durable cross-task
  rule, record it as an ADR (or state why not) before closure.

## Planning notes

- 2026-07-12 — backlog bootstrapped during the birth cleanup wave. The
  standing maintainer rule applies: no commits without his explicit word;
  branches stay local.
