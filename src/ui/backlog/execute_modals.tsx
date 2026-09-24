// Confirmation modals for the execute lane: single execute, batch execute
// (single shared context), and merge-into-master. The page owns the open
// flags + targets; QA/worker config comes from use_exec_pipeline.
import React from "react";

import { copyText } from "@abstractframework/panel-chat";

import type { BacklogExecConfigResponse, BacklogItemSummary } from "../../lib/gateway_client";
import type { Readiness } from "../board/board_model";
import { Modal } from "../modal";
import { type BacklogTaskType, type ExecutionMode, WORK_ITEM_TYPES } from "./model";

/**
 * Definition-of-Ready checklist. Shows the EVIDENCE behind each check (what
 * the parser actually found) so mis-parses are visible instead of just red
 * (adversarial design review, 2026-07-12). null readiness renders an
 * EXPLICIT "not evaluated" state — a silently absent gate is a bypass.
 * Client-side and advisory by design; the server-side gate is a filed
 * gateway ask (docs/backlog/proposed/0009).
 */
function ReadinessChecklist(props: { readiness: Readiness | null; server_refused?: boolean; on_open_spec?: () => void }): React.ReactElement | null {
  const { readiness, server_refused, on_open_spec } = props;
  if (!readiness) {
    return (
      <div style={{ marginTop: "10px" }}>
        <div className="mono" style={{ color: "rgb(250, 204, 21)", fontSize: "var(--font-size-sm)" }}>
          Definition of Ready: NOT EVALUATED — the spec could not be scanned. The server gate still checks on execute.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: "10px" }}>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "6px" }}>
        Definition of Ready{" "}
        <span style={{ opacity: 0.7 }}>
          {server_refused ? "(the gateway refused this execute — server-evaluated checks below)" : "(advisory — parsed from the spec)"}
        </span>
      </div>
      {readiness.checks.map((c) => (
        <div key={c.id} className="mono" style={{ fontSize: "var(--font-size-sm)", color: c.ok ? "rgb(74, 222, 128)" : "rgb(250, 204, 21)" }}>
          {c.ok ? "✓" : "○"} {c.label}
          {c.evidence ? <span style={{ opacity: 0.75 }}> — {c.evidence}</span> : null}
        </div>
      ))}
      {!readiness.ok ? (
        <div className="row" style={{ alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
          <span className="mono" style={{ color: "rgb(250, 204, 21)", fontSize: "var(--font-size-sm)" }}>
            This spec is not ready — executing anyway is an override.
          </span>
          {on_open_spec ? (
            <button className="btn" type="button" onClick={on_open_spec}>
              Open spec to fix
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkerUnavailableNotice(props: { exec_cfg: BacklogExecConfigResponse | null; with_setup?: boolean }): React.ReactElement {
  const { exec_cfg, with_setup } = props;
  // Settings-first (gateway c2194: the toggle reconciles the worker live,
  // no restart); the gateway's CLI is the terminal door to the same
  // settings (never environment variables — operator rule). Canonical
  // executor ids, never the retired codex_cli aliases.
  const setup_env = [
    "abstractgateway config set backlog_exec_runner on   # or: Settings → Gateway administration → Enable",
    "abstractgateway config set executor codex           # canonical: codex | claude | cursor-agent | abstractcode",
  ];
  return (
    <div style={{ marginTop: "10px" }}>
      <div className="detail_warn" style={{ marginTop: 0 }}>
        {exec_cfg?.runner_enabled !== true
          ? "Backlog exec runner is disabled on this gateway — admins can enable it live from Settings → Gateway administration."
          : exec_cfg?.runner_alive === false
            ? "Backlog exec runner is not running on this gateway."
            : exec_cfg?.codex_available === false
              ? `The configured executor is not available on the gateway host (${String(exec_cfg?.codex_bin || exec_cfg?.executor || "binary")} not found).`
              : "Backlog exec is not available on this gateway."}
      </div>
      {exec_cfg?.runner_error ? <div className="detail_hint">{exec_cfg.runner_error}</div> : null}
      {with_setup ? (
        <details style={{ marginTop: "8px" }}>
          <summary className="muted" style={{ fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
            Setup from the gateway's computer (terminal)
          </summary>
          <div style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
            <pre className="mono setup_callout_pre" style={{ marginTop: 0 }}>
              {setup_env.join("\n")}
            </pre>
            <button className="btn" style={{ marginTop: "4px" }} onClick={() => copyText(setup_env.join("\n"))}>
              Copy setup
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ExecutionModeSelect(props: {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  disabled: boolean;
  inplace_warning: string;
  uat_note: string;
}): React.ReactElement {
  const { value, onChange, disabled, inplace_warning, uat_note } = props;
  return (
    <div style={{ marginTop: "10px" }}>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "6px" }}>
        Execution mode
      </div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as any)} disabled={disabled} style={{ width: "100%" }}>
        <option value="uat">UAT (staged, safe)</option>
        <option value="inplace">Inplace (dangerous, edits prod)</option>
      </select>
      {value === "inplace" ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          {inplace_warning}
        </div>
      ) : (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          {uat_note}
        </div>
      )}
    </div>
  );
}

/** Agent overrides accepted by the gateway execute endpoints (c1090 +
 *  the per-request executor, c2194 point 5). */
export type AgentOverride = { executor?: string; target_model?: string; target_reasoning_effort?: string };

/** Registry row shape (GET /admin/executors — canonical ids). */
export type ExecutorOption = { id: string; display?: string; available?: boolean; default?: boolean };

const REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;

/**
 * Per-request execution agent (operator directive: codex today, claude /
 * cursor-agent / abstractcode per request tomorrow). Unavailable agents
 * render disabled with the probe reason; the gateway re-validates
 * pre-enqueue and refuses 400 verbatim — the UI never second-guesses it.
 */
function ExecutorSelect(props: {
  executors: ExecutorOption[] | null;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}): React.ReactElement | null {
  const { executors, value, onChange, disabled } = props;
  if (!executors || !executors.length) return null; // registry not served — gateway default applies
  const default_row = executors.find((e) => e.default);
  return (
    <div style={{ marginTop: "10px" }}>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "6px" }}>
        Execution agent
      </div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ width: "100%" }}>
        <option value="">gateway default{default_row ? ` (${default_row.display || default_row.id})` : ""}</option>
        {executors.map((e) => (
          <option key={e.id} value={e.id} disabled={e.available === false}>
            {e.display || e.id}
            {e.available === false ? " (unavailable on the gateway host)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Collapsed "recruit a different agent" section. Free-form model id by
 * design: the allowlist lives server-side (ABSTRACTGATEWAY_BACKLOG_EXEC_
 * ALLOWED_MODELS) and refusals come back as operator-readable 403s which
 * the modal renders verbatim — the UI never second-guesses the gate.
 */
function AgentOverrideSection(props: {
  exec_cfg: BacklogExecConfigResponse | null;
  model: string;
  set_model: (v: string) => void;
  effort: string;
  set_effort: (v: string) => void;
  disabled: boolean;
}): React.ReactElement {
  const { exec_cfg, model, set_model, effort, set_effort, disabled } = props;
  return (
    <details style={{ marginTop: "8px" }} open={Boolean(model || effort)}>
      <summary className="mono muted" style={{ fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
        Assign a different agent (operator override)
      </summary>
      <div className="row" style={{ gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
        <div className="col" style={{ minWidth: 200 }}>
          <div className="field">
            <label>Model</label>
            <input
              value={model}
              onChange={(e) => set_model(e.target.value)}
              placeholder={String(exec_cfg?.codex_model || "gateway default")}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="col" style={{ minWidth: 160 }}>
          <div className="field">
            <label>Reasoning effort</label>
            <select value={effort} onChange={(e) => set_effort(e.target.value)} disabled={disabled}>
              <option value="">gateway default</option>
              {REASONING_EFFORTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "4px" }}>
        Overrides validate against the gateway's model allowlist; a refusal is shown verbatim below.
      </div>
    </details>
  );
}

export function ExecuteConfirmModal(props: {
  open: boolean;
  target: { kind: string; filename: string; title: string } | null;
  execute_mode: ExecutionMode;
  set_execute_mode: (mode: ExecutionMode) => void;
  action_loading: boolean;
  action_error: string;
  exec_cfg: BacklogExecConfigResponse | null;
  exec_cfg_loading: boolean;
  exec_cfg_error: string;
  /** Definition-of-Ready evaluation (null = unknown, e.g. content not loaded). */
  readiness?: Readiness | null;
  /** True when readiness holds SERVER-evaluated checks from a 409 refusal. */
  server_refused?: boolean;
  /** When set, the DoR panel shows the checklist (or the explicit "not evaluated" state for null readiness). */
  show_readiness?: boolean;
  /** Optional "Open spec to fix" affordance when checks fail. */
  on_open_spec?: () => void;
  /** Executor registry (feature-detected; null = not served → the picker
   *  hides and the gateway default applies). */
  executors?: ExecutorOption[] | null;
  /** Overrides are undefined when the operator kept the gateway defaults. */
  on_confirm: (override?: AgentOverride) => void;
  on_close: () => void;
}): React.ReactElement {
  const { open, target, execute_mode, set_execute_mode, action_loading, action_error, exec_cfg, exec_cfg_loading, exec_cfg_error, on_confirm, on_close } =
    props;
  const readiness = props.readiness ?? null;
  const show_readiness = props.show_readiness === true;
  const [override_model, set_override_model] = React.useState("");
  const [override_effort, set_override_effort] = React.useState("");
  const [override_executor, set_override_executor] = React.useState("");
  const target_filename = target?.filename || "";
  React.useEffect(() => {
    set_override_model("");
    set_override_effort("");
    set_override_executor("");
  }, [target_filename]);
  const override: AgentOverride | undefined =
    override_model.trim() || override_effort || override_executor
      ? {
          executor: override_executor || undefined,
          target_model: override_model.trim() || undefined,
          target_reasoning_effort: override_effort || undefined,
        }
      : undefined;
  return (
    <Modal
      open={open}
      title="Execute backlog item?"
      onClose={on_close}
      actions={
        <>
          <button className="btn" onClick={on_close} disabled={action_loading}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => on_confirm(override)}
            disabled={action_loading || exec_cfg_loading || !target || exec_cfg?.can_execute !== true}
          >
            {action_loading
              ? "Executing…"
              : show_readiness && !readiness
                ? "Execute (readiness unknown)"
                : readiness && !readiness.ok
                  ? "Execute anyway (override)"
                  : "Execute"}
          </button>
        </>
      }
    >
      <div className="mono" style={{ fontSize: "var(--font-size-sm)" }}>
        Target:{" "}
        <span className="mono" style={{ fontWeight: 700 }}>
          {target ? target.title : "(unknown)"}
        </span>
      </div>
      {exec_cfg ? (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
          Agent: {String(exec_cfg.executor || "executor")}
          {exec_cfg.codex_model ? ` · ${exec_cfg.codex_model}` : ""}
          {exec_cfg.codex_reasoning_effort ? ` (reasoning ${exec_cfg.codex_reasoning_effort})` : ""}
        </div>
      ) : null}
      <ExecutorSelect executors={props.executors ?? null} value={override_executor} onChange={set_override_executor} disabled={action_loading} />
      <AgentOverrideSection
        exec_cfg={exec_cfg}
        model={override_model}
        set_model={set_override_model}
        effort={override_effort}
        set_effort={set_override_effort}
        disabled={action_loading}
      />
      {show_readiness ? <ReadinessChecklist readiness={readiness} server_refused={props.server_refused} on_open_spec={props.on_open_spec} /> : null}
      <ExecutionModeSelect
        value={execute_mode}
        onChange={set_execute_mode}
        disabled={action_loading}
        inplace_warning="Warning: inplace runs directly in the prod workspace. Use only when you understand the risk."
        uat_note="The run will execute in a candidate workspace. When it reaches “awaiting QA”, click “Restart UAT” to deploy it to the shared UAT stack. After you promote or iterate, UAT services are stopped automatically."
      />
      {exec_cfg_loading ? (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          Checking worker…
        </div>
      ) : null}
      {!exec_cfg_loading && exec_cfg?.can_execute !== true ? <WorkerUnavailableNotice exec_cfg={exec_cfg} with_setup /> : null}
      {exec_cfg_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {exec_cfg_error}
        </div>
      ) : null}
      {action_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {action_error}
        </div>
      ) : null}
    </Modal>
  );
}

export function BatchExecuteModal(props: {
  open: boolean;
  batch_selected_items: BacklogItemSummary[];
  batch_execute_mode: ExecutionMode;
  set_batch_execute_mode: (mode: ExecutionMode) => void;
  batch_execute_loading: boolean;
  batch_execute_error: string;
  exec_cfg: BacklogExecConfigResponse | null;
  exec_cfg_loading: boolean;
  exec_cfg_error: string;
  /** Executor registry (feature-detected; see ExecuteConfirmModal). */
  executors?: ExecutorOption[] | null;
  on_confirm: (executor?: string) => void;
  on_close: () => void;
}): React.ReactElement {
  const {
    open,
    batch_selected_items,
    batch_execute_mode,
    set_batch_execute_mode,
    batch_execute_loading,
    batch_execute_error,
    exec_cfg,
    exec_cfg_loading,
    exec_cfg_error,
    on_confirm,
    on_close,
  } = props;
  const [batch_executor, set_batch_executor] = React.useState("");
  React.useEffect(() => {
    if (!open) set_batch_executor("");
  }, [open]);
  return (
    <Modal
      open={open}
      title="Execute batch (single context)?"
      onClose={on_close}
      actions={
        <>
          <button className="btn" onClick={on_close} disabled={batch_execute_loading}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => on_confirm(batch_executor || undefined)}
            disabled={batch_execute_loading || exec_cfg_loading || batch_selected_items.length < 2 || exec_cfg?.can_execute !== true}
          >
            {batch_execute_loading ? "Executing…" : "Execute batch"}
          </button>
        </>
      }
    >
      <div className="mono" style={{ fontSize: "var(--font-size-sm)" }}>
        Items:{" "}
        <span className="mono" style={{ fontWeight: 700 }}>
          {batch_selected_items.length}
        </span>
      </div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
        This queues a single exec request whose prompt includes all selected backlog items (in order), so the agent keeps a shared growing context.
      </div>
      <ExecutorSelect executors={props.executors ?? null} value={batch_executor} onChange={set_batch_executor} disabled={batch_execute_loading} />
      <ExecutionModeSelect
        value={batch_execute_mode}
        onChange={set_batch_execute_mode}
        disabled={batch_execute_loading}
        inplace_warning="Warning: inplace runs directly in the prod workspace (for the entire batch). Use only when you understand the risk."
        uat_note="The batch will execute in a candidate workspace. When it reaches “awaiting QA”, click “Restart UAT” to deploy it to the shared UAT stack. After you promote or iterate, UAT services are stopped automatically."
      />
      {batch_selected_items.length ? (
        <div className="mono" style={{ fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {batch_selected_items.map((it) => (
            <div key={`batchitem:${it.filename}`}>- docs/backlog/planned/{it.filename}</div>
          ))}
        </div>
      ) : null}

      {exec_cfg_loading ? (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          Checking worker…
        </div>
      ) : null}
      {!exec_cfg_loading && exec_cfg?.can_execute !== true ? <WorkerUnavailableNotice exec_cfg={exec_cfg} /> : null}
      {exec_cfg_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {exec_cfg_error}
        </div>
      ) : null}
      {batch_execute_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {batch_execute_error}
        </div>
      ) : null}
    </Modal>
  );
}

export function MergeMasterModal(props: {
  open: boolean;
  batch_selected_items: BacklogItemSummary[];
  merge_package: string;
  set_merge_package: (v: string) => void;
  merge_task_type: BacklogTaskType;
  set_merge_task_type: (v: BacklogTaskType) => void;
  merge_title: string;
  set_merge_title: (v: string) => void;
  merge_summary: string;
  set_merge_summary: (v: string) => void;
  merge_loading: boolean;
  merge_error: string;
  on_confirm: () => void;
  on_close: () => void;
}): React.ReactElement {
  const {
    open,
    batch_selected_items,
    merge_package,
    set_merge_package,
    merge_task_type,
    set_merge_task_type,
    merge_title,
    set_merge_title,
    merge_summary,
    set_merge_summary,
    merge_loading,
    merge_error,
    on_confirm,
    on_close,
  } = props;
  return (
    <Modal
      open={open}
      title="Merge planned items into master backlog?"
      onClose={on_close}
      actions={
        <>
          <button className="btn" onClick={on_close} disabled={merge_loading}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={on_confirm}
            disabled={merge_loading || batch_selected_items.length < 2 || !merge_title.trim() || !merge_package.trim()}
          >
            {merge_loading ? "Merging…" : "Create master"}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: "10px", flexWrap: "wrap" }}>
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Package</label>
            <input value={merge_package} onChange={(e) => set_merge_package(e.target.value)} placeholder="framework" />
          </div>
        </div>
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Type</label>
            <select value={merge_task_type} onChange={(e) => set_merge_task_type(e.target.value as any)}>
              {WORK_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="field" style={{ marginTop: "10px" }}>
        <label>Title</label>
        <input value={merge_title} onChange={(e) => set_merge_title(e.target.value)} placeholder="Master backlog" />
      </div>
      <div className="field" style={{ marginTop: "10px" }}>
        <label>Summary (optional)</label>
        <textarea value={merge_summary} onChange={(e) => set_merge_summary(e.target.value)} rows={3} />
      </div>

      {batch_selected_items.length ? (
        <div style={{ marginTop: "10px" }}>
          <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
            Referenced backlog items:
          </div>
          <div className="mono" style={{ fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
            {batch_selected_items.map((it) => (
              <div key={`mergeitem:${it.filename}`}>- docs/backlog/planned/{it.filename}</div>
            ))}
          </div>
        </div>
      ) : null}

      {merge_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "10px" }}>
          {merge_error}
        </div>
      ) : null}
    </Modal>
  );
}
