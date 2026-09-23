// The Backlog page — the FILE ARCHIVE of the development flow (redesigned
// 2026-07-13; the mail-client two-pane layout was observer heritage).
// One table over the selected kind (Planned / Proposed / Recurrent /
// Completed / Deprecated / Trash) with per-row lifecycle actions; clicking
// a row opens the SAME WorkItemDrawer the board uses (Spec / Runs /
// Review). Execution live views live on the Executions page — this page
// is about the files.
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";

import type { BacklogItemSummary, GatewayClient } from "../../lib/gateway_client";
import { type Readiness, readiness_from_dor_refusal, evaluate_readiness, parse_work_item_metadata, normalize_list_priority, summary_has_list_metadata } from "../board/board_model";
import { BacklogUnconfiguredCallout, is_backlog_unconfigured } from "../backlog_unconfigured";
import { WorkItemDrawer, type DrawerKind, type DrawerTarget } from "../board/work_item_drawer";
import { AdvisorDrawer } from "./advisor_drawer";
import { type AgentOverride, BatchExecuteModal, ExecuteConfirmModal, MergeMasterModal } from "./execute_modals";
import { use_executor_registry, use_media_query } from "./hooks";
import { type BacklogTaskType, WORK_ITEM_TYPES, read_task_type, task_type_chip, task_type_title } from "./model";
import { use_exec_pipeline } from "./use_exec_pipeline";

const KINDS: Array<{ id: DrawerKind; label: string }> = [
  { id: "planned", label: "Planned" },
  { id: "proposed", label: "Proposed" },
  { id: "recurrent", label: "Recurrent" },
  { id: "completed", label: "Completed" },
  { id: "deprecated", label: "Deprecated" },
  { id: "trash", label: "Trash" },
];

export type BacklogBrowserPageProps = {
  gateway: GatewayClient;
  gateway_connected: boolean;
  maintenance_ai_provider?: string;
  maintenance_ai_model?: string;
  /** Reasoning effort forwarded on the `thinking` wire key (contract v1). */
  maintenance_ai_reasoning?: string;
  backlog_advisor_agent?: string;
  voice_session_id?: string;
  default_execution_mode?: "uat" | "inplace";
  /** Jump to the Executions page (drawer "Follow live"). */
  on_open_executions?: (request_id?: string) => void;
};

export function BacklogBrowserPage(props: BacklogBrowserPageProps): React.ReactElement {
  const gateway = props.gateway;
  const can_use_gateway = props.gateway_connected;
  const maint_provider = String(props.maintenance_ai_provider || "").trim();
  const maint_model = String(props.maintenance_ai_model || "").trim();
  const maint_reasoning = String(props.maintenance_ai_reasoning || "").trim();
  const advisor_agent = String(props.backlog_advisor_agent || "").trim() || "basic-agent";
  const default_mode = props.default_execution_mode === "inplace" ? "inplace" : "uat";
  const is_compact_layout = use_media_query("(max-width: 900px)");

  const [kind, set_kind] = useState<DrawerKind>("planned");
  const [items, set_items] = useState<BacklogItemSummary[]>([]);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState("");
  const [query, set_query] = useState("");
  const [type_filter, set_type_filter] = useState("all");
  const [action_error, set_action_error] = useState("");
  /** Filenames with a live exec request (queued/running/awaiting_qa) —
   *  Execute is disabled for them (double-queue = duplicate agent run). */
  const [busy_filenames, set_busy_filenames] = useState<Set<string>>(new Set());
  /** Stale-response guard: kind switches race the slower fetch otherwise
   *  (adversary find — Trash tab showing Planned rows). */
  const refresh_gen = useRef(0);

  const [drawer_target, set_drawer_target] = useState<DrawerTarget | null>(null);

  // Batch selection (planned only): filenames ticked in the table.
  const [selected_filenames, set_selected_filenames] = useState<string[]>([]);

  // Execute flow (same shape as the board: DoR readiness + server-409
  // override discipline + agent override).
  const [execute_target, set_execute_target] = useState<{ filename: string; title: string; readiness: Readiness | null; server_refused?: boolean } | null>(null);
  const [execute_mode, set_execute_mode] = useState<"uat" | "inplace">(default_mode);
  const [execute_loading, set_execute_loading] = useState(false);
  // Per-request agent picker options (gateway c2194 point 5).
  const executor_registry = use_executor_registry(gateway, can_use_gateway);
  const [execute_error, set_execute_error] = useState("");

  const [batch_execute_open, set_batch_execute_open] = useState(false);
  const [batch_execute_mode, set_batch_execute_mode] = useState<"uat" | "inplace">(default_mode);
  const [batch_execute_loading, set_batch_execute_loading] = useState(false);
  const [batch_execute_error, set_batch_execute_error] = useState("");
  const [batch_dor_refused, set_batch_dor_refused] = useState(false);

  const [merge_open, set_merge_open] = useState(false);
  const [merge_package, set_merge_package] = useState("framework");
  const [merge_task_type, set_merge_task_type] = useState<BacklogTaskType>("task");
  const [merge_title, set_merge_title] = useState("");
  const [merge_summary, set_merge_summary] = useState("");
  const [merge_loading, set_merge_loading] = useState(false);
  const [merge_error, set_merge_error] = useState("");

  // Worker config for execute gating (config loader only; no exec polling
  // on this page — the Executions page is the live view).
  const pipeline = use_exec_pipeline({
    gateway,
    can_use_gateway,
    kind: "planned",
    completed_view: "tasks",
    is_exec_view: false,
    is_compact_layout,
    set_compact_pane: () => {},
    on_status_transfer: () => {},
  });

  async function refresh(): Promise<void> {
    if (!can_use_gateway) return;
    const gen = ++refresh_gen.current;
    set_loading(true);
    set_error("");
    try {
      const res = await gateway.backlog_list(kind as any);
      if (gen !== refresh_gen.current) return; // superseded by a kind switch
      set_items(Array.isArray(res?.items) ? res.items : []);
    } catch (e: any) {
      if (gen !== refresh_gen.current) return;
      set_items([]);
      set_error(String(e?.message || e || "Failed to load backlog"));
    } finally {
      if (gen === refresh_gen.current) set_loading(false);
    }
    // Busy set (planned only): the same one-busy-answer-everywhere source
    // the board uses; failure degrades to an empty set (Execute enabled —
    // the gateway still refuses true duplicates server-side).
    if (kind === "planned") {
      try {
        const res = await gateway.backlog_exec_active_items();
        if (gen !== refresh_gen.current) return;
        const busy = new Set<string>();
        for (const it of Array.isArray(res?.items) ? res.items : []) {
          const fn = String((it as any)?.filename || "").trim();
          if (fn) busy.add(fn);
        }
        set_busy_filenames(busy);
      } catch {
        if (gen === refresh_gen.current) set_busy_filenames(new Set());
      }
    } else {
      set_busy_filenames(new Set());
    }
  }

  useEffect(() => {
    set_selected_filenames([]);
    set_action_error("");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, can_use_gateway]);

  // Prune selections that left the list (moved/merged elsewhere) so the
  // "N selected" chip never counts phantoms.
  useEffect(() => {
    set_selected_filenames((prev) => {
      const live = new Set(items.map((it) => String(it.filename || "").trim()));
      const next = prev.filter((fn) => live.has(fn));
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tf = type_filter.trim().toLowerCase();
    return items.filter((it) => {
      if (tf && tf !== "all" && read_task_type(it.task_type) !== tf) return false;
      if (!q) return true;
      const labels = Array.isArray(it.labels) ? it.labels.join(" ") : "";
      const hay = `${it.item_id || ""} ${it.package || ""} ${it.title || ""} ${it.task_type || ""} ${it.summary || ""} ${it.filename || ""} ${labels} ${it.priority || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, type_filter]);

  const selected_items = useMemo(
    () => items.filter((it) => selected_filenames.includes(String(it.filename || "").trim())),
    [items, selected_filenames]
  );

  const unconfigured = is_backlog_unconfigured(error);

  function open_drawer(it: BacklogItemSummary): void {
    set_drawer_target({ filename: String(it.filename || ""), kind, title: it.title || it.filename, initial_tab: "spec" });
  }

  async function move_item(it: BacklogItemSummary, to_kind: DrawerKind): Promise<void> {
    set_action_error("");
    try {
      await gateway.backlog_move({ from_kind: kind, to_kind, filename: String(it.filename || "") });
      await refresh();
    } catch (e: any) {
      set_action_error(String(e?.message || e || "Move failed"));
    }
  }

  async function open_execute(it: BacklogItemSummary): Promise<void> {
    const filename = String(it.filename || "").trim();
    if (!filename) return;
    let readiness: Readiness | null = null;
    try {
      const res = await gateway.backlog_content("planned", filename);
      readiness = evaluate_readiness({ task_type: it.task_type }, parse_work_item_metadata(String(res?.content || "")));
    } catch {
      readiness = null; // explicit "not evaluated" state in the modal
    }
    set_execute_error("");
    set_execute_mode(default_mode);
    set_execute_target({ filename, title: it.title || filename, readiness });
    void pipeline.load_exec_config();
  }

  async function confirm_execute(override?: AgentOverride): Promise<void> {
    if (!execute_target || execute_loading) return;
    set_execute_loading(true);
    set_execute_error("");
    try {
      const cfg = pipeline.exec_cfg || (await pipeline.load_exec_config());
      if (!cfg || cfg.can_execute !== true) {
        set_execute_error(cfg?.runner_error || "Backlog exec is not available on this gateway.");
        return;
      }
      const dor_override = Boolean(execute_target.readiness && !execute_target.readiness.ok);
      await gateway.backlog_execute({
        kind: "planned",
        filename: execute_target.filename,
        execution_mode: execute_mode,
        executor: override?.executor,
        target_model: override?.target_model,
        target_reasoning_effort: override?.target_reasoning_effort,
        dor: "check",
        override: dor_override,
      });
      set_execute_target(null);
      await refresh();
    } catch (e: any) {
      const server_readiness = readiness_from_dor_refusal(e);
      if (server_readiness) {
        set_execute_target((cur) => (cur ? { ...cur, readiness: server_readiness, server_refused: true } : cur));
        set_execute_error("");
      } else {
        set_execute_error(String(e?.message || e || "Execute failed"));
      }
    } finally {
      set_execute_loading(false);
    }
  }

  async function confirm_execute_batch(executor?: string): Promise<void> {
    if (batch_execute_loading || selected_items.length < 2) return;
    set_batch_execute_error("");
    set_batch_execute_loading(true);
    try {
      const cfg = pipeline.exec_cfg || (await pipeline.load_exec_config());
      if (!cfg || cfg.can_execute !== true) {
        set_batch_execute_error(cfg?.runner_error || "Backlog exec is not available on this gateway.");
        return;
      }
      await gateway.backlog_execute_batch({
        items: selected_items.map((it) => ({ kind: "planned", filename: String(it.filename || "") })),
        execution_mode: batch_execute_mode,
        executor,
        dor: "check",
        override: batch_dor_refused,
      });
      set_batch_execute_open(false);
      set_selected_filenames([]);
      set_batch_dor_refused(false);
      await refresh();
    } catch (e: any) {
      const server_readiness = readiness_from_dor_refusal(e);
      if (server_readiness) {
        const failing = server_readiness.checks.filter((c) => !c.ok);
        set_batch_dor_refused(true);
        set_batch_execute_error(
          `Definition of Ready refused by the gateway:\n${failing.map((c) => `○ ${c.label}${c.evidence ? ` — ${c.evidence}` : ""}`).join("\n")}\nExecute batch again to override (recorded as dor_overridden).`
        );
      } else {
        set_batch_execute_error(String(e?.message || e || "Execute batch failed"));
      }
    } finally {
      set_batch_execute_loading(false);
    }
  }

  async function submit_merge_master(): Promise<void> {
    if (merge_loading || selected_items.length < 2) return;
    const title = merge_title.trim();
    if (!title) {
      set_merge_error("Title is required.");
      return;
    }
    set_merge_error("");
    set_merge_loading(true);
    try {
      await gateway.backlog_merge({
        kind: "planned",
        items: selected_items.map((it) => ({ kind: "planned", filename: String(it.filename || "") })),
        package: merge_package.trim() || "framework",
        task_type: merge_task_type,
        title,
        summary: merge_summary.trim() || undefined,
      });
      set_merge_open(false);
      set_selected_filenames([]);
      await refresh();
    } catch (e: any) {
      set_merge_error(String(e?.message || e || "Merge failed"));
    } finally {
      set_merge_loading(false);
    }
  }

  function toggle_selected(filename: string): void {
    const fn = String(filename || "").trim();
    set_selected_filenames((prev) => (prev.includes(fn) ? prev.filter((x) => x !== fn) : [...prev, fn]));
  }

  function row_actions(it: BacklogItemSummary): React.ReactElement | null {
    if (kind === "planned") {
      const busy = busy_filenames.has(String(it.filename || "").trim());
      return (
        <>
          {/* Busy state rides the Execute button itself — a separate chip
              overflowed the fixed actions column and clipped invisibly
              (adversary find). */}
          <button
            className="btn"
            onClick={() => void open_execute(it)}
            disabled={!can_use_gateway || busy}
            title={busy ? "A live execution request already exists for this item" : undefined}
          >
            {busy ? "Processing…" : "Execute"}
          </button>
          <button className="btn" title="Move back to Triage (proposed)" onClick={() => void move_item(it, "proposed")} disabled={!can_use_gateway}>
            → Triage
          </button>
          <button className="btn" title="Move to trash" onClick={() => void move_item(it, "trash")} disabled={!can_use_gateway}>
            Trash
          </button>
        </>
      );
    }
    if (kind === "proposed") {
      return (
        <>
          <button className="btn" title="Promote to Ready (planned)" onClick={() => void move_item(it, "planned")} disabled={!can_use_gateway}>
            → Ready
          </button>
          <button className="btn" title="Deprecate" onClick={() => void move_item(it, "deprecated")} disabled={!can_use_gateway}>
            Deprecate
          </button>
          <button className="btn" title="Move to trash" onClick={() => void move_item(it, "trash")} disabled={!can_use_gateway}>
            Trash
          </button>
        </>
      );
    }
    if (kind === "recurrent") {
      return (
        <button className="btn" title="Move to trash" onClick={() => void move_item(it, "trash")} disabled={!can_use_gateway}>
          Trash
        </button>
      );
    }
    if (kind === "deprecated" || kind === "trash") {
      return (
        <button className="btn" title="Restore to Triage (proposed)" onClick={() => void move_item(it, "proposed")} disabled={!can_use_gateway}>
          Restore
        </button>
      );
    }
    return null; // completed: the archive is a record, not a work queue
  }

  return (
    <div className="page page_pad backlog_page">
      <div className="page_toolbar">
        <div className="seg seg_scroll" role="group" aria-label="Backlog kinds">
          {KINDS.map((t) => (
            <button
              key={t.id}
                            aria-pressed={kind === t.id}
              className={`seg_btn ${kind === t.id ? "active" : ""}`}
              onClick={() => set_kind(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!can_use_gateway ? <span className="page_hint mono">Not connected — use the connection control (top right).</span> : null}
        <div className="page_toolbar_spacer" />
        <button
          className={`btn btn_icon ${loading ? "is_loading" : ""}`}
          onClick={() => void refresh()}
          disabled={!can_use_gateway || loading}
          title="Refresh"
          aria-label="Refresh"
        >
          <Icon name="refresh" size={16} />
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {unconfigured ? (
        <BacklogUnconfiguredCallout surface="the backlog archive" />
      ) : (
        <>
          <div className="page_toolbar">
            <input
              className="board_search"
              value={query}
              onChange={(e) => set_query(e.target.value)}
              placeholder="Search backlog (id/title/package/filename…)"
            />
            <select value={type_filter} onChange={(e) => set_type_filter(e.target.value)} title="Filter by type">
              <option value="all">all types</option>
              {WORK_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="page_toolbar_spacer" />
            {kind === "planned" && selected_filenames.length ? (
              <>
                <span className="chip mono info">{selected_filenames.length} selected</span>
                <button
                  className="btn primary"
                  disabled={selected_filenames.length < 2}
                  onClick={() => {
                    set_batch_execute_error("");
                    set_batch_execute_mode(default_mode);
                    set_batch_dor_refused(false);
                    set_batch_execute_open(true);
                    void pipeline.load_exec_config();
                  }}
                >
                  Execute batch
                </button>
                <button
                  className="btn"
                  disabled={selected_filenames.length < 2}
                  onClick={() => {
                    const pkgs = selected_items.map((x) => String(x.package || "").trim()).filter(Boolean);
                    set_merge_package(pkgs.length && pkgs.every((p) => p === pkgs[0]) ? pkgs[0] : "framework");
                    set_merge_task_type("task");
                    set_merge_title(`Master backlog (${selected_items.length} items)`);
                    set_merge_summary("");
                    set_merge_error("");
                    set_merge_open(true);
                  }}
                >
                  Merge → master
                </button>
              </>
            ) : null}
            <span className="mono muted backlog_count" style={{ fontSize: "var(--font-size-sm)" }}>
              {filtered.length}/{items.length}
            </span>
          </div>

          {error && !unconfigured ? <div className="page_error mono">{error}</div> : null}
          {action_error ? <div className="page_error mono">{action_error}</div> : null}

          <div className="pane backlog_table_pane">
            <div className="pane_header">
              <span className="pane_title">{KINDS.find((k) => k.id === kind)?.label}</span>
              <span className="pane_count">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
            </div>
            <div className="pane_body" style={{ padding: 0 }}>
              {!filtered.length ? (
                <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", padding: "12px" }}>
                  {loading ? "Loading…" : "No items."}
                </div>
              ) : (
                <table className="data_table backlog_table">
                  <thead>
                    <tr>
                      {kind === "planned" ? <th className="backlog_table_sel col_sel" /> : null}
                      <th className="col_id">#</th>
                      <th className="col_type">type</th>
                      <th className="col_package">package</th>
                      <th>title</th>
                      <th className="col_priority">priority</th>
                      <th className="col_labels">labels</th>
                      {kind !== "completed" ? <th className="backlog_table_actions col_actions">actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it) => {
                      const fn = String(it.filename || "").trim();
                      const tt = read_task_type(it.task_type);
                      const prio = summary_has_list_metadata(it) ? normalize_list_priority(it.priority) : null;
                      const labels = Array.isArray(it.labels) ? it.labels : [];
                      return (
                        <tr key={`${kind}:${fn}`} className="backlog_row" onClick={() => open_drawer(it)}>
                          {kind === "planned" ? (
                            <td className="backlog_table_sel col_sel" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selected_filenames.includes(fn)}
                                onChange={() => toggle_selected(fn)}
                                aria-label={`Select ${fn}`}
                              />
                            </td>
                          ) : null}
                          <td className="mono muted col_id">{it.item_id || ""}</td>
                          <td className="col_type">
                            {tt ? (
                              <span className={`chip mono ${task_type_chip(tt)}`} title={task_type_title(tt)}>
                                {tt}
                              </span>
                            ) : null}
                          </td>
                          <td className="mono muted col_package" title={it.package || ""}>
                            {it.package || ""}
                          </td>
                          <td className="backlog_table_title" title={fn}>
                            {it.title || fn}
                          </td>
                          <td className="col_priority">{prio ? <span className={`chip mono board_prio_${prio.toLowerCase()}`}>{prio}</span> : null}</td>
                          <td className="col_labels" title={labels.join(", ")}>
                            {labels.slice(0, 2).map((l) => (
                              <span key={l} className="chip mono info" style={{ marginRight: 4 }}>
                                {l}
                              </span>
                            ))}
                            {labels.length > 2 ? <span className="chip mono muted">+{labels.length - 2}</span> : null}
                          </td>
                          {kind !== "completed" ? (
                            <td className="backlog_table_actions col_actions" onClick={(e) => e.stopPropagation()}>
                              <div className="entity_card_actions">{row_actions(it)}</div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <ExecuteConfirmModal
        open={Boolean(execute_target)}
        target={execute_target ? { kind: "planned", filename: execute_target.filename, title: execute_target.title } : null}
        execute_mode={execute_mode}
        set_execute_mode={set_execute_mode}
        action_loading={execute_loading}
        action_error={execute_error}
        exec_cfg={pipeline.exec_cfg}
        exec_cfg_loading={pipeline.exec_cfg_loading}
        exec_cfg_error={pipeline.exec_cfg_error}
        executors={executor_registry}
        readiness={execute_target?.readiness ?? null}
        server_refused={execute_target?.server_refused === true}
        show_readiness
        on_open_spec={
          execute_target
            ? () => {
                const t = execute_target;
                set_execute_target(null);
                set_drawer_target({ filename: t.filename, kind: "planned", title: t.title, initial_tab: "spec" });
              }
            : undefined
        }
        on_confirm={(override) => void confirm_execute(override)}
        on_close={() => set_execute_target(null)}
      />

      <BatchExecuteModal
        open={batch_execute_open}
        batch_selected_items={selected_items}
        batch_execute_mode={batch_execute_mode}
        set_batch_execute_mode={set_batch_execute_mode}
        batch_execute_loading={batch_execute_loading}
        batch_execute_error={batch_execute_error}
        executors={executor_registry}
        exec_cfg={pipeline.exec_cfg}
        exec_cfg_loading={pipeline.exec_cfg_loading}
        exec_cfg_error={pipeline.exec_cfg_error}
        on_confirm={(executor) => void confirm_execute_batch(executor)}
        on_close={() => {
          set_batch_execute_open(false);
          set_batch_execute_error("");
          set_batch_dor_refused(false);
        }}
      />

      <MergeMasterModal
        open={merge_open}
        batch_selected_items={selected_items}
        merge_package={merge_package}
        set_merge_package={set_merge_package}
        merge_task_type={merge_task_type}
        set_merge_task_type={set_merge_task_type}
        merge_title={merge_title}
        set_merge_title={set_merge_title}
        merge_summary={merge_summary}
        set_merge_summary={set_merge_summary}
        merge_loading={merge_loading}
        merge_error={merge_error}
        on_confirm={() => void submit_merge_master()}
        on_close={() => {
          set_merge_open(false);
          set_merge_error("");
        }}
      />

      <WorkItemDrawer
        gateway={gateway}
        can_use_gateway={can_use_gateway}
        target={drawer_target}
        on_close={() => set_drawer_target(null)}
        on_mutated={async () => {
          await refresh();
        }}
        on_open_executions={(request_id) => props.on_open_executions?.(request_id)}
      />

      <AdvisorDrawer
        gateway={gateway}
        can_use_gateway={can_use_gateway}
        is_compact_layout={is_compact_layout}
        maint_provider={maint_provider}
        maint_model={maint_model}
        maint_reasoning={maint_reasoning}
        advisor_agent={advisor_agent}
        focus_kind={kind as any}
        focus_type={type_filter as any}
        voice_session_id={props.voice_session_id}
      />
    </div>
  );
}
