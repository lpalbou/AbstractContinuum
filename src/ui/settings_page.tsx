// Settings: package preferences + gateway administration posture.
// Connection management lives in the TOP-RIGHT header control (abstractflow
// practice — operator ruling 2026-07-13).
//
// Administration model (operator directive 17:28): the gateway is the
// GATEKEEPER — this pane renders the live posture and, for the gateway
// admin, the controls of its settings door (POST /admin/runtime-config).
// Each setting shows WHERE its value comes from (launch flag / saved
// setting / environment (legacy) / default) — never an env-var recipe
// (operator rule 2026-09-24: settings and --flags, not environment
// variables).
import React, { useEffect, useState } from "react";

import { ProviderModelPicker, type GatewayConnectionState, type ProviderOption } from "@abstractframework/ui-kit";

import { knob_bool, knob_string, type AdminRuntimeConfigResponse, type DataHomeRow, type GatewayClient } from "../lib/gateway_client";
import { is_backlog_unavailable } from "./backlog_folder";
import { VoiceSettingsPanel } from "./voice_settings_panel";

export type ContinuumSettings = {
  maintenance_ai_provider: string;
  maintenance_ai_model: string;
  /** Reasoning effort for the maintenance model (reasoning-1st-citizen
   *  plan, continuum section): "" = gateway default / none. Wire key is
   *  `thinking` (contract v1 — "Reasoning" is the UI label only). */
  maintenance_ai_reasoning: string;
  backlog_advisor_agent: string;
  /** Preselected execution mode in every execute dialog. */
  default_execution_mode: "uat" | "inplace";
};

/** Contract-v1 effort ladder (reasoning-1st-citizen, c5769) — used ONLY
 *  as the set-anyway override list when the gateway serves no facts for a
 *  model (ABSENT = UNKNOWN). When facts exist, the model's own served
 *  `reasoning_levels` are the options — never this list. */
const REASONING_LADDER = ["minimal", "low", "medium", "high", "xhigh"] as const;

/** Interim reasoning selector (delegate call c5869; swaps to @uic's shared
 *  coupled component when it ships). Three states from the served facts:
 *  - thinking_support=true  -> the model's served reasoning_levels
 *  - thinking_support=false -> locked "none — this model doesn't reason"
 *  - facts absent/unreachable -> LOCKED "unknown" + a set-anyway override
 *    (three-state coupling: unknown fails safe WITHOUT killing local/
 *    endpoint models that simply lack registry rows).
 *  The value forwards on the `thinking` wire key; "Reasoning" is only the
 *  label. Zero client-owned capability tables — facts are fetched per
 *  model from the gateway, rendered verbatim. */
function ReasoningSelect(props: {
  gateway: GatewayClient;
  connected: boolean;
  model: string;
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement | null {
  const { gateway, connected, model, value, onChange } = props;
  const [facts, set_facts] = useState<{ state: "loading" | "supported" | "unsupported" | "unknown"; levels: string[] }>({ state: "unknown", levels: [] });
  const [override_unknown, set_override_unknown] = useState(false);
  useEffect(() => {
    set_override_unknown(false);
    const m = String(model || "").trim();
    if (!m || !connected) {
      set_facts({ state: "unknown", levels: [] });
      return;
    }
    let stale = false;
    set_facts({ state: "loading", levels: [] });
    gateway
      .discovery_model_capabilities(m)
      .then((res) => {
        if (stale) return;
        const caps = res?.capabilities && typeof res.capabilities === "object" ? res.capabilities : {};
        const support = (caps as any).thinking_support;
        const levels = Array.isArray((caps as any).reasoning_levels) ? ((caps as any).reasoning_levels as any[]).map((x) => String(x)) : [];
        if (support === true) set_facts({ state: "supported", levels });
        else if (support === false) set_facts({ state: "unsupported", levels: [] });
        else set_facts({ state: "unknown", levels: [] });
      })
      .catch(() => {
        if (!stale) set_facts({ state: "unknown", levels: [] });
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, connected]);
  // No model picked: the axis has no subject — render nothing (the picker's
  // defaultHint already explains gateway defaults).
  if (!String(model || "").trim()) return null;
  const locked = facts.state === "unsupported" || (facts.state === "unknown" && !override_unknown) || facts.state === "loading";
  const options = facts.state === "supported" && facts.levels.length ? facts.levels : facts.state === "unknown" && override_unknown ? [...REASONING_LADDER] : [];
  return (
    <div className="field" data-testid="reasoning_select">
      <label>Reasoning (effort for {model})</label>
      <select
        value={locked ? "" : value}
        onChange={(e) => onChange(String(e.target.value || ""))}
        disabled={locked}
        title={
          facts.state === "supported"
            ? "Efforts this model declares (gateway-served). Sent on the `thinking` wire key; blank = gateway default."
            : facts.state === "unsupported"
              ? "This model declares no reasoning support — effort is locked to none (contract v1: non-reasoning models naturally get none)."
              : facts.state === "loading"
                ? "Checking the model's served capabilities…"
                : "The gateway serves no reasoning facts for this model (unknown ≠ unsupported). Locked fail-safe; tick “set anyway” if you know the model reasons."
        }
      >
        <option value="">{facts.state === "unsupported" ? "none — this model doesn't reason" : facts.state === "loading" ? "checking…" : facts.state === "unknown" && !override_unknown ? "unknown — no served facts" : "gateway default"}</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {facts.state === "unknown" && !locked ? (
        <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>Override active: efforts unverified for this model — the provider may reject or ignore them.</div>
      ) : null}
      {facts.state === "unknown" ? (
        <label className="muted" style={{ fontSize: "var(--font-size-sm)", display: "inline-flex", gap: "6px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={override_unknown}
            onChange={(e) => {
              set_override_unknown(e.target.checked);
              if (!e.target.checked) onChange("");
            }}
          />
          set anyway (I know this model reasons)
        </label>
      ) : null}
    </div>
  );
}

/** Inline editor for the triage repo root — the knob most likely to be
 *  wrong on first run had state but no control while every other knob
 *  had a button (adversary find). Apply-on-click only; the gateway
 *  validates and refuses with its own words. */
function TriageRootEditor(props: { current: string; busy: boolean; on_apply: (value: string) => void }): React.ReactElement {
  const [editing, set_editing] = useState(false);
  const [value, set_value] = useState("");
  if (!editing) {
    return (
      <button
        className="btn"
        disabled={props.busy}
        onClick={() => {
          set_value(props.current);
          set_editing(true);
        }}
      >
        {props.current ? "Change…" : "Set…"}
      </button>
    );
  }
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        className="mono"
        style={{ minWidth: 260 }}
        value={value}
        onChange={(e) => set_value(e.target.value)}
        placeholder="/path/to/a/folder/with/docs/backlog"
        disabled={props.busy}
      />
      <button
        className="btn primary"
        disabled={props.busy || !value.trim()}
        onClick={() => {
          props.on_apply(value.trim());
          set_editing(false);
        }}
      >
        Apply
      </button>
      <button className="btn" disabled={props.busy} onClick={() => set_editing(false)}>
        Cancel
      </button>
    </span>
  );
}

type GatewayPosture = {
  loaded: boolean;
  process_manager: boolean | null;
  backlog_root: boolean | null;
  /** Worst-of exec pipeline state: enabled AND alive AND can_execute —
   *  the enabled flag alone disagreed with the Executions page (adversary
   *  find: enabled-but-dead-thread rendered "on" here, "off" there). */
  exec_pipeline: "on" | "degraded" | "off" | null;
  exec_detail: string;
  executor: string;
};

export function SettingsPage(props: {
  gateway: GatewayClient;
  gateway_connected: boolean;
  settings: ContinuumSettings;
  set_settings: React.Dispatch<React.SetStateAction<ContinuumSettings>>;
  /** Session principal (kit connection state) — names WHO the admin story
   *  applies to; the gateway stays the authority on every write. */
  connection?: GatewayConnectionState | null;
}): React.ReactElement {
  const { gateway, gateway_connected, settings, set_settings } = props;
  const principal = props.connection?.gateway?.principal;

  const [posture, set_posture] = useState<GatewayPosture>({
    loaded: false,
    process_manager: null,
    backlog_root: null,
    exec_pipeline: null,
    exec_detail: "",
    executor: "",
  });
  /** Non-null once GET /admin/runtime-config answers (contract c1554). */
  const [admin_cfg, set_admin_cfg] = useState<AdminRuntimeConfigResponse | null>(null);
  /** Advisor workflow catalog (operator 21:13: the advisor field must be
   *  a dropdown of executable workflows — those with an interface). null
   *  = endpoint unavailable → the free-text input stays (feature-detect,
   *  never dead UI). */
  const [workflows, set_workflows] = useState<Array<{ id: string; name: string; description?: string }> | null>(null);
  /** User explicitly chose "custom bundle id…" — the select stays on the
   *  custom row while they type, without a placeholder value ever
   *  touching persisted settings. */
  const [force_custom, set_force_custom] = useState(false);
  /** Data & Caches telemetry (c1729 claim; rows live since c1806). null =
   *  endpoint not served (older gateway) — the pane renders its pending
   *  note instead (feature-detect, never dead UI). */
  const [data_homes, set_data_homes] = useState<DataHomeRow[] | null>(null);
  const [data_homes_warnings, set_data_homes_warnings] = useState<string[]>([]);
  const [admin_error, set_admin_error] = useState("");
  const [admin_busy, set_admin_busy] = useState(false);
  const [posture_nonce, set_posture_nonce] = useState(0);

  /** Admin write: one key per call; the response is the fresh posture.
   *  Refusals render verbatim (the gateway is the gatekeeper). */
  async function admin_update(patch: Parameters<GatewayClient["admin_runtime_config_update"]>[0]): Promise<void> {
    if (admin_busy) return;
    set_admin_busy(true);
    set_admin_error("");
    try {
      const cfg = await gateway.admin_runtime_config_update(patch);
      set_admin_cfg(cfg);
      set_posture_nonce((n) => n + 1); // re-derive the posture table
    } catch (e: any) {
      set_admin_error(String(e?.message || e || "Config update refused"));
    } finally {
      set_admin_busy(false);
    }
  }

  useEffect(() => {
    if (!gateway_connected) return;
    let stop = false;
    void (async () => {
      const next: GatewayPosture = { loaded: true, process_manager: null, backlog_root: null, exec_pipeline: null, exec_detail: "", executor: "" };

      // Exec pipeline posture always comes from the full config (worst-of
      // enabled/alive/can_execute), whichever admin surface exists.
      try {
        const cfg = await gateway.backlog_exec_config();
        const enabled = Boolean(cfg?.runner_enabled);
        const alive = Boolean(cfg?.runner_alive);
        const can = cfg?.can_execute === true;
        next.exec_pipeline = can ? "on" : enabled || alive ? "degraded" : "off";
        next.exec_detail = can
          ? ""
          : !enabled
            ? "runner disabled"
            : !alive
              ? "runner enabled but not alive"
              : "runner alive but cannot execute (executor missing?)";
        next.executor = String(cfg?.executor || "").trim();
      } catch {
        next.exec_pipeline = null;
      }

      // Feature-detect the authoritative admin surface (c1554, live-shaped
      // {value, source} — knob_* helpers accept both spellings); a 404 =
      // not built yet on this gateway → read-only posture probes.
      try {
        const cfg = await gateway.admin_runtime_config();
        if (cfg && typeof cfg === "object") {
          if (!stop) {
            set_admin_cfg(cfg);
            next.process_manager = knob_bool(cfg.process_manager);
            // A resolved folder that is not usable (a vanished saved path)
            // reads as NOT available — `available` is served since mission II.
            next.backlog_root =
              cfg.triage_repo_root?.available !== undefined ? Boolean(cfg.triage_repo_root.available) : knob_bool(cfg.triage_repo_root);
            set_posture(next);
          }
          return;
        }
      } catch {
        // Fall through to the probe posture below.
      }
      try {
        const p = await gateway.list_processes();
        next.process_manager = Boolean(p?.enabled);
      } catch {
        next.process_manager = null;
      }
      try {
        // Cheapest read in the family with the same 404-not-configured
        // class (a planned LIST parses every file header server-side).
        await gateway.backlog_template();
        next.backlog_root = true;
      } catch (e) {
        next.backlog_root = is_backlog_unavailable(e) ? false : null;
      }
      if (!stop) set_posture(next);
    })();
    // Data & Caches telemetry — independent fetch, feature-detected.
    void (async () => {
      try {
        const res = await gateway.admin_data_homes();
        if (!stop) {
          set_data_homes(Array.isArray(res?.homes) ? res.homes : []);
          set_data_homes_warnings(Array.isArray(res?.warnings) ? res.warnings : []);
        }
      } catch {
        if (!stop) set_data_homes(null);
      }
    })();
    // Workflow catalog for the advisor dropdown: GET /api/gateway/bundles
    // → bundles carry entrypoints; only entrypoints DECLARING a non-empty
    // `interfaces` contract are operator-selectable (the observer's Launch
    // picker reads the same field the same way — two seats, one filter).
    void (async () => {
      try {
        const res = await gateway.list_bundles();
        const bundles: any[] = Array.isArray(res?.items) ? res.items : Array.isArray(res?.bundles) ? res.bundles : Array.isArray(res) ? res : [];
        const out: Array<{ id: string; name: string; description?: string }> = [];
        for (const b of bundles) {
          const bid = String(b?.bundle_id || b?.id || "").trim();
          if (!bid) continue;
          const eps: any[] = Array.isArray(b?.entrypoints) ? b.entrypoints : [];
          for (const ep of eps) {
            if (ep?.deprecated === true) continue;
            const interfaces: any[] = Array.isArray(ep?.interfaces) ? ep.interfaces : [];
            if (!interfaces.some((i) => String(i || "").trim().length > 0)) continue;
            const name = String(ep?.name || "").trim();
            out.push({
              id: bid,
              name: name ? `${bid} · ${name}` : bid,
              description: String(ep?.description || "").trim() || undefined,
            });
          }
        }
        // One row per bundle id (a bundle with several interface
        // entrypoints still resolves by bundle id on the advisor call).
        const seen = new Set<string>();
        const unique = out.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
        unique.sort((a, b) => a.name.localeCompare(b.name));
        if (!stop) set_workflows(unique);
      } catch {
        if (!stop) set_workflows(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [gateway, gateway_connected, posture_nonce]);

  function format_bytes(n?: number): string {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
    return `${n} B`;
  }

  function posture_chip(state: boolean | null, on = "on", off = "off"): React.ReactElement {
    if (state === null) return <span className="chip mono muted">unknown</span>;
    return <span className={`chip mono ${state ? "ok" : "warn"}`}>{state ? on : off}</span>;
  }

  /** Which rung won: launch flag > saved setting > environment (legacy) >
   *  default (gateway mission II). The environment rung is only REPORTED —
   *  saving a value here replaces it. */
  function source_chip(source?: string): React.ReactElement | null {
    const s = String(source || "").trim();
    if (!s) return null;
    const words: Record<string, [string, string, string]> = {
      flag: ["launch flag", "info", "Set by a launch flag of the running gateway; a saved value applies once it restarts without the flag."],
      stored: ["setting", "info", "Saved setting (Settings here, the gateway console, or `abstractgateway config set`)."],
      env: ["environment (legacy)", "warn", "Set by the environment the gateway was started with. Save a value here to replace it."],
      default: ["default", "muted", "Nothing saved: the gateway's default."],
    };
    const [label, tone, title] = words[s] || [s, "muted", ""];
    return (
      <span className={`chip mono ${tone}`} title={title} data-testid="source_chip">
        {label}
      </span>
    );
  }

  return (
    <div className="page page_scroll">
      <div className="page_inner page_pad constrained">
        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Execution defaults</span>
            <span className="pane_subtitle">preference — this browser</span>
          </div>
          <div className="pane_body">
            <div className="field">
              <label>Default execution mode (preselected in execute dialogs)</label>
              <select
                value={settings.default_execution_mode}
                onChange={(e) => set_settings((s) => ({ ...s, default_execution_mode: e.target.value === "inplace" ? "inplace" : "uat" }))}
              >
                <option value="uat">UAT (staged, safe) — recommended</option>
                <option value="inplace">Inplace (dangerous, edits prod)</option>
              </select>
            </div>
            <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>
              Every execute dialog still shows the mode selector — this only sets what it starts on.
            </div>
          </div>
        </div>

        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">AI assistance</span>
            <span className="pane_subtitle">preference — this browser</span>
          </div>
          <div className="pane_body">
            <div className="field">
              <label>Maintenance AI (backlog assist — refine/dod/labels)</label>
              {/* Kit component (uic c1558, absorbed same-day from our copy —
                  ours is deleted). Transport is injected: two adapters over
                  the app's gateway client. */}
              <ProviderModelPicker
                disabled={!gateway_connected}
                value={{ provider: settings.maintenance_ai_provider, model: settings.maintenance_ai_model }}
                onChange={(v) =>
                  set_settings((s) => ({
                    ...s,
                    maintenance_ai_provider: v.provider,
                    maintenance_ai_model: v.model,
                    // A stored effort must never silently carry onto a
                    // different model (contract v1: no silent escalation) —
                    // model change resets reasoning to gateway-default.
                    maintenance_ai_reasoning: v.model === s.maintenance_ai_model ? s.maintenance_ai_reasoning : "",
                  }))
                }
                fetchProviders={async (): Promise<ProviderOption[]> => {
                  const res = await gateway.discovery_providers();
                  return (Array.isArray(res?.items) ? res.items : []).map((p) => ({ name: p.name, display_name: p.display_name }));
                }}
                fetchModels={async (provider: string): Promise<string[]> => {
                  const res = await gateway.discovery_provider_models(provider);
                  return Array.isArray(res?.models) ? res.models : [];
                }}
                defaultHint="Uses the gateway's configured default provider and model for maintenance calls."
              />
            </div>
            {/* INTERIM reasoning selector (reasoning-1st-citizen, delegate
                call c5869): capability-gated against gateway-served facts —
                three states per contract v1 (supported = the model's own
                levels; unsupported = locked none; UNKNOWN = locked with a
                set-anyway override so endpoint/local models aren't dead).
                Swaps to @uic's shared coupled selector the day it ships. */}
            <ReasoningSelect
              gateway={gateway}
              connected={gateway_connected}
              model={settings.maintenance_ai_model}
              value={settings.maintenance_ai_reasoning}
              onChange={(v) => set_settings((s) => ({ ...s, maintenance_ai_reasoning: v }))}
            />
            <div className="field">
              <label>Advisor workflow (executable workflows served by this gateway)</label>
              {workflows === null ? (
                // Older gateway / catalog unreachable: the free-text input
                // stays (feature-detect, never dead UI).
                <input
                  className="mono"
                  value={settings.backlog_advisor_agent}
                  onChange={(e) => set_settings((s) => ({ ...s, backlog_advisor_agent: String(e.target.value || "") }))}
                  placeholder="basic-agent"
                  title="This gateway does not serve the workflow catalog — enter a bundle id."
                />
              ) : (
                (() => {
                  const current = String(settings.backlog_advisor_agent || "").trim();
                  const known = current === "" || workflows.some((w) => w.id === current);
                  return (
                    <>
                      <select
                        value={known && !force_custom ? current : "__custom__"}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__custom__") {
                            // The input below takes over; the SAVED value is
                            // untouched until the user types (a placeholder
                            // sentinel in persisted settings would send the
                            // advisor after a bundle that does not exist).
                            set_force_custom(true);
                          } else {
                            set_force_custom(false);
                            set_settings((s) => ({ ...s, backlog_advisor_agent: v }));
                          }
                        }}
                        title="Workflows the gateway can run for advice; blank = the shipped basic-agent"
                      >
                        <option value="">gateway default (basic-agent)</option>
                        {workflows.map((w) => (
                          <option key={w.id} value={w.id} title={w.description || undefined}>
                            {w.name || w.id}
                          </option>
                        ))}
                        <option value="__custom__">custom bundle id…</option>
                      </select>
                      {!known || force_custom ? (
                        <input
                          className="mono"
                          style={{ marginTop: 6 }}
                          value={settings.backlog_advisor_agent}
                          onChange={(e) => set_settings((s) => ({ ...s, backlog_advisor_agent: String(e.target.value || "") }))}
                          placeholder="bundle id (e.g. docs-qa@0.1.0)"
                        />
                      ) : null}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>

        <VoiceSettingsPanel gateway={gateway} gateway_connected={gateway_connected} />

        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Gateway administration</span>
            <span className="pane_subtitle">server-side — the gateway is the gatekeeper</span>
          </div>
          <div className="pane_body">
            {!gateway_connected ? (
              <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>
                Connect to a gateway to see its posture (top-right control).
              </div>
            ) : (
              <>
                {principal?.user_id ? (
                  <div style={{ fontSize: "var(--font-size-sm)", marginBottom: "8px" }}>
                    Signed in as <strong>{principal.user_id}</strong>
                    {principal.admin === true ? (
                      <span className="chip mono ok" style={{ marginLeft: 6 }}>
                        gateway admin
                      </span>
                    ) : principal.admin === false ? (
                      <span className="chip mono muted" style={{ marginLeft: 6 }} title="This pane stays read-only for non-admin principals.">
                        not admin
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {(() => {
                  // Change controls render ONLY on writable:true — the
                  // gateway's principal-resolved authority, never a client
                  // guess (c1563/c1569). One knob per act; refusals verbatim.
                  // Layout: stacked ROWS (name + state + action on one
                  // line, env detail below) — the old 5-column table put
                  // actions behind a horizontal scroll (operator 07-14).
                  const can_write = admin_cfg?.writable === true;
                  const executors = Array.isArray(admin_cfg?.executors) ? admin_cfg.executors : [];
                  return (
                    <div>
                      <div className="admin_row" data-testid="admin_row_backlog_folder">
                        <div className="admin_row_top">
                          <span className="admin_row_name">Backlog folder</span>
                          {posture_chip(posture.backlog_root, "available", "not available")}
                          {source_chip(admin_cfg?.triage_repo_root?.source)}
                          <div className="admin_row_action">
                            {can_write &&
                            admin_cfg?.triage_repo_root?.default_path &&
                            knob_string(admin_cfg?.triage_repo_root) !== admin_cfg.triage_repo_root.default_path ? (
                              <button
                                className="btn"
                                disabled={admin_busy}
                                onClick={() => void admin_update({ triage_repo_root: admin_cfg?.triage_repo_root?.default_path || null })}
                                title={admin_cfg.triage_repo_root.default_path}
                              >
                                Use the gateway's own folder
                              </button>
                            ) : null}
                            {can_write ? (
                              <TriageRootEditor current={knob_string(admin_cfg?.triage_repo_root)} busy={admin_busy} on_apply={(v) => void admin_update({ triage_repo_root: v })} />
                            ) : null}
                          </div>
                        </div>
                        <div className="admin_row_detail">
                          {admin_cfg?.triage_repo_root?.help ||
                            "The folder whose docs/backlog holds the items the Board and Backlog pages show."}
                          {knob_string(admin_cfg?.triage_repo_root) ? (
                            <>
                              {" "}
                              In use: <code>{knob_string(admin_cfg?.triage_repo_root)}</code>
                            </>
                          ) : null}
                          {admin_cfg?.triage_repo_root?.available === false && admin_cfg.triage_repo_root.reason ? (
                            <> — not available: {admin_cfg.triage_repo_root.reason}</>
                          ) : null}
                        </div>
                      </div>

                      <div className="admin_row">
                        <div className="admin_row_top">
                          <span className="admin_row_name">Exec runner</span>
                          {posture.exec_pipeline === null ? (
                            <span className="chip mono muted">unknown</span>
                          ) : (
                            <span className={`chip mono ${posture.exec_pipeline === "on" ? "ok" : "warn"}`}>{posture.exec_pipeline}</span>
                          )}
                          {source_chip(admin_cfg?.backlog_exec_runner?.source)}
                          <div className="admin_row_action">
                            {can_write ? (
                              <button
                                className="btn"
                                disabled={admin_busy}
                                onClick={() => void admin_update({ backlog_exec_runner: !(knob_bool(admin_cfg?.backlog_exec_runner) === true) })}
                              >
                                {knob_bool(admin_cfg?.backlog_exec_runner) === true ? "Disable" : "Enable"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="admin_row_detail">
                          {admin_cfg?.backlog_exec_runner?.help || "Runs the backlog items queued for execution on the gateway's computer."}
                          {posture.exec_detail ? <> — {posture.exec_detail}</> : null}
                        </div>
                      </div>

                      <div className="admin_row">
                        <div className="admin_row_top">
                          <span className="admin_row_name">Executor</span>
                          {posture.executor && posture.executor !== "none" ? (
                            <span className="chip mono ok">{posture.executor}</span>
                          ) : (
                            <span className="chip mono warn">none</span>
                          )}
                          {source_chip(admin_cfg?.executor?.source)}
                          <div className="admin_row_action">
                            {can_write && executors.length ? (
                              <select
                                value={knob_string(admin_cfg?.executor)}
                                disabled={admin_busy}
                                onChange={(e) => void admin_update({ executor: String(e.target.value || "") })}
                                title="Pick the execution agent (validated by the gateway registry)"
                              >
                                {executors.map((ex) => (
                                  <option key={ex.id} value={ex.id} disabled={ex.available === false}>
                                    {ex.display || ex.id}
                                    {ex.available === false ? " (unavailable)" : ""}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </div>
                        <div className="admin_row_detail">
                          The agent that runs queued items (the gateway lists what is installed on its computer).
                        </div>
                      </div>

                      <div className="admin_row">
                        <div className="admin_row_top">
                          <span className="admin_row_name">Process manager</span>
                          {posture_chip(posture.process_manager, "enabled", "disabled")}
                          {source_chip(admin_cfg?.process_manager?.source)}
                          <div className="admin_row_action">
                            {can_write ? (
                              <button
                                className="btn"
                                disabled={admin_busy}
                                onClick={() => void admin_update({ process_manager: !(knob_bool(admin_cfg?.process_manager) === true) })}
                              >
                                {knob_bool(admin_cfg?.process_manager) === true ? "Disable" : "Enable"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="admin_row_detail">
                          {admin_cfg?.process_manager?.help || "Powers the Services page. High trust: whoever reaches Services can redeploy."}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {admin_error ? <div className="page_error mono" style={{ marginTop: "6px" }}>{admin_error}</div> : null}
                <div className="muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                  {/* Three-way on writable: absence of the field is NOT
                      evidence of denial (older admin surface). */}
                  {admin_cfg
                    ? admin_cfg.writable === true
                      ? "Changes are saved on the gateway and apply at once; a launch flag of the running gateway wins until it restarts without it. The same settings: gateway console (Apps → Backlog settings) or `abstractgateway config set <key> <value>` on the gateway's computer."
                      : admin_cfg.writable === false
                        ? "This gateway serves the admin config surface, but your principal is not authorized to change it (admin only)."
                        : "This gateway serves the admin config surface (write authority unknown — it predates the writable flag)."
                    : "This gateway does not serve its settings to Continuum (older build): update the gateway to change these from here."}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Data and caches</span>
            <span className="pane_subtitle">
              {data_homes ? `server-side — ${data_homes.length} registered home${data_homes.length === 1 ? "" : "s"}` : "server-side — read-only telemetry"}
            </span>
          </div>
          <div className="pane_body">
            {!gateway_connected ? (
              <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>
                Connect to a gateway to see its data footprint.
              </div>
            ) : data_homes === null ? (
              <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>
                This gateway does not serve the data-homes registry yet (older build) — the table lights up on its next restart. Purge
                actions live on the gateway console either way; this card is read-only by design.
              </div>
            ) : (
              <>
                <div className="table_scroll">
                <table className="data_table mono">
                  <thead>
                    <tr>
                      <th>name</th>
                      <th>kind</th>
                      <th>owner</th>
                      <th>size</th>
                      <th>purge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data_homes]
                      .sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
                      .map((h) => (
                        <tr key={h.name} title={h.description || h.path}>
                          <td>{h.name}</td>
                          <td>
                            <span className="chip mono muted">{h.kind}</span>
                          </td>
                          <td className="muted">{h.owner}</td>
                          <td>{h.exists === false ? <span className="chip mono warn">missing</span> : format_bytes(h.size_bytes)}</td>
                          <td>
                            {h.safe_to_purge ? (
                              <span className="chip mono ok">purgeable</span>
                            ) : (
                              <span className="chip mono warn" title={h.description || "Protected — the owner's rule refuses purge"}>
                                protected
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
                {data_homes_warnings.map((w, i) => (
                  <div key={`dhw:${i}`} className="page_error mono" style={{ marginTop: "6px" }}>
                    {w}
                  </div>
                ))}
                <div className="muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                  Read-only view over the framework data registry (hover a row for its path and purge rule). Purge verbs live on the
                  gateway console — one management surface, per the cache-management split ruling.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
