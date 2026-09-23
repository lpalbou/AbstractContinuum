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
| Proposed | 5 |
| Completed | 16 |
| Deprecated | 0 |
| Recurrent | 2 |

## Next recommended work

1. `planned/0001_publish_gated_app_server_dependency.md` — swap the
   `file:` dependency to `@abstractframework/app-server@^0.1.9` once that
   package is on npm; it gates the first npm publish of this app.
2. `proposed/0021_panel_hub_boundary_hardening.md` — settles the Team
   page / hub boundary ahead of any web-chat extraction.
3. `planned/0002_uic_adoption_shared_modules.md` — adopt the shared kit
   components for `modal.tsx` / `multi_select.tsx` when they land.

## Planned

| ID | Item | Notes |
| --- | --- | --- |
| 0001 | `planned/0001_publish_gated_app_server_dependency.md` | Swap `file:../abstractuic/app-server` to a semver range on publish |
| 0002 | `planned/0002_uic_adoption_shared_modules.md` | Migrate shared widgets (modal / multi_select) to abstractuic once adopted |

## Proposed

| ID | Item | Promotion criteria |
| --- | --- | --- |
| 0003 | `proposed/0003_exec_stream_and_log_cursor.md` | Log cursor done; promote when the gateway ships exec-request SSE |
| 0004 | `proposed/0004_executor_abstraction.md` | A second executor (e.g. abstractcode) becomes concrete gateway-side |
| 0008 | `proposed/0008_gateway_metadata_and_promote_carry.md` | Gateway ships promote-carry (list-level metadata already consumed) |
| 0021 | `proposed/0021_panel_hub_boundary_hardening.md` | A hub web-chat extraction is scheduled |
| 0022 | `proposed/0022_desk_ws_test_harness_tail.md` | Desk / WS relay test-harness debt is picked up |

## Completed

| ID | Item | Outcome |
| --- | --- | --- |
| 0005 | `completed/0005_ci_workflow.md` | CI + release workflows (2026-09-23) |
| 0006 | `completed/0006_attachment_insert_order_quirk.md` | Attachment insert order decided |
| 0007 | `completed/0007_birth_cleanup_wave.md` | Client + CSS pruned, monolith split, Executions page, docs/tests bootstrapped |
| 0009 | `completed/0009_server_dor_gate_and_agent_assignment.md` | Server-side DoR gate + execute-time agent assignment consumed |
| 0010 | `completed/0010_board_first_redesign.md` | Board-first redesign: sidebar IA, kanban + drawer, DoR/DoD, Agents page |
| 0010 | `completed/0010_team_settings_adversary_p2_tail.md` | Team/Settings review tail (shares the 0010 prefix by mistake; kept for history) |
| 0011 | `completed/0011_unified_work_board_join.md` | Board claim-join + Team work-id chips |
| 0012 | `completed/0012_console_entity_skills_section.md` | Entity Skills section |
| 0013 | `completed/0013_per_message_reactions.md` | Per-message ±1 reactions |
| 0014 | `completed/0014_message_retraction_console.md` | Message retraction |
| 0015 | `completed/0015_board_team_reconciliation.md` | Board reflects Team work |
| 0016 | `completed/0016_unified_backlog_hub_union.md` | Board/Backlog read the hub work union |
| 0017 | `completed/0017_operator_desk.md` | Operator desk |
| 0018 | `completed/0018_board_content_access.md` | Every board card opens real content |
| 0019 | `completed/0019_message_display_reliability_tail.md` | Message-display reliability tail |
| 0020 | `completed/0020_md_doc_hierarchy_all_surfaces.md` | Reading hierarchy on every markdown surface |

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

- 2026-07-12 — backlog bootstrapped during the birth cleanup wave.
- 2026-09-23 — overview reconciled with the directories for the first
  public release (0.2.0); CI item 0005 completed.
