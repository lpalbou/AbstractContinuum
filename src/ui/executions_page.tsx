// Executions — mission control for the execution agent: a stat strip
// (what is happening right now), active runs as rich cards, a compact
// recently-finished table, and the full detail/QA pane for the selected
// run. Redesigned 2026-07-13 (operator: the mail-client look was observer
// heritage; this page is now card/stat-first).
//
// Executor-agnostic by design: the worker chip and copy come from the
// gateway's exec config (executor type + model), never hardcoded to codex.
import React, { useEffect, useMemo, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";

import type { BacklogExecRequestSummary, GatewayClient } from "../lib/gateway_client";
import { BacklogUnavailablePanel, is_backlog_unavailable, use_backlog_status } from "./backlog_folder";
import { ExecDetailPane } from "./backlog/exec_detail_pane";
import { use_media_query } from "./backlog/hooks";
import { exec_status_chip_class, exec_time_stats, format_duration_ms, short_id } from "./backlog/model";
import { use_exec_pipeline } from "./backlog/use_exec_pipeline";

const RECENT_LIMIT = 10;

export function ExecutionsPage(props: {
  gateway: GatewayClient;
  gateway_connected: boolean;
  /** Deep link: preselect this request on mount (board "Follow live"). */
  focus_request_id?: string;
  on_focus_consumed?: () => void;
  /** Jump to Settings → Gateway administration (setup callout action). */
  on_open_settings?: () => void;
}): React.ReactElement {
  const { gateway, gateway_connected } = props;
  const is_compact_layout = use_media_query("(max-width: 900px)");
  const [compact_pane, set_compact_pane] = useState<"list" | "detail">("list");
  /** Executor registry (feature-detected): when it serves, the setup
   *  callout speaks REGISTRY truth ("pick a default") instead of the env
   *  recipe — the operator hit the contradiction live (registry showed 4
   *  available while this page said "no executor... env + restart"). */
  const [registry, set_registry] = useState<Array<{ id: string; display?: string; available?: boolean }> | null>(null);
  async function refetch_registry(): Promise<void> {
    try {
      const res = await gateway.admin_executors();
      const rows = Array.isArray(res) ? res : Array.isArray((res as any)?.executors) ? (res as any).executors : [];
      set_registry(rows);
    } catch {
      set_registry(null);
    }
  }
  useEffect(() => {
    if (!gateway_connected) {
      set_registry(null);
      return;
    }
    void refetch_registry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, gateway_connected]);

  const pipeline = use_exec_pipeline({
    gateway,
    can_use_gateway: gateway_connected,
    kind: "processing",
    completed_view: "tasks",
    is_exec_view: true,
    is_compact_layout,
    set_compact_pane,
    on_status_transfer: () => {
      void refresh_recent();
    },
  });

  const [recent, set_recent] = useState<BacklogExecRequestSummary[]>([]);
  const [recent_error, set_recent_error] = useState("");

  async function refresh_recent(): Promise<void> {
    if (!gateway_connected) return;
    try {
      const res = await gateway.backlog_exec_requests({ status: "completed,promoted,failed", limit: 50 });
      const list = Array.isArray(res?.requests) ? res.requests : [];
      list.sort((a, b) => {
        const ta = String(a.finished_at || a.started_at || a.created_at || "");
        const tb = String(b.finished_at || b.started_at || b.created_at || "");
        return tb.localeCompare(ta);
      });
      set_recent(list.slice(0, RECENT_LIMIT));
      set_recent_error("");
    } catch (e: any) {
      set_recent_error(String(e?.message || e || "Failed to load recent executions"));
    }
  }

  useEffect(() => {
    if (!gateway_connected) return;
    void (async () => {
      const list = await pipeline.refresh_exec_list("processing");
      await refresh_recent();
      const focus = String(props.focus_request_id || "").trim();
      if (focus) {
        const match = list.find((r) => r.request_id === focus);
        if (match) await pipeline.load_exec_request(match);
        else {
          try {
            const detail = await gateway.backlog_exec_request(focus);
            if (detail?.payload) {
              await pipeline.load_exec_request({ request_id: focus, status: String(detail.payload.status || "unknown") } as any);
            }
          } catch {
            // Focused request unknown — the page still renders normally.
          }
        }
        props.on_focus_consumed?.();
      }
    })();
    // Stand down while the shared-IP gateway lock is warm (incident
    // 2026-07-15) — a poll during a 429 keeps the fleet's lock warm.
    const t = setInterval(() => {
      if (gateway.is_backing_off()) return;
      void refresh_recent();
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway_connected, props.focus_request_id]);

  // Live-duration ticker for running cards (data poll stays at 2s).
  const has_running = pipeline.exec_requests.some((r) => String(r.status || "").toLowerCase() === "running");
  const [, set_tick] = useState(0);
  useEffect(() => {
    if (!has_running) return;
    const t = setInterval(() => set_tick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(t);
  }, [has_running]);

  const active = pipeline.exec_requests;
  const counts = useMemo(() => {
    let queued = 0;
    let running = 0;
    let awaiting = 0;
    for (const r of active) {
      const st = String(r.status || "").trim().toLowerCase();
      if (st === "queued") queued += 1;
      else if (st === "running") running += 1;
      else if (st === "awaiting_qa") awaiting += 1;
    }
    return { queued, running, awaiting };
  }, [active]);

  const cfg = pipeline.exec_cfg;
  const worker_on = Boolean(cfg?.runner_alive);
  const raw_executor = String(cfg?.executor || "").trim();
  const no_executor = !raw_executor || raw_executor === "none";
  const executor_label = no_executor ? "execution agent" : raw_executor;
  // Health = CAN EXECUTE, not thread-alive (adversary P0: runner_alive with
  // executor "none" rendered a green page over a gateway that can run
  // nothing — remediation then looked complete while Execute still refused).
  const pipeline_healthy = Boolean(cfg?.can_execute);
  const unconfigured = is_backlog_unavailable(pipeline.exec_error) || is_backlog_unavailable(recent_error);
  const [folder_nonce, set_folder_nonce] = useState(0);
  const backlog_folder = use_backlog_status(gateway, gateway_connected && unconfigured, folder_nonce);

  const show_compact_list = !is_compact_layout || compact_pane === "list";
  const show_compact_detail = !is_compact_layout || compact_pane === "detail";

  return (
    <div className="page page_pad exec_page">
      <div className="page_toolbar">
        {gateway_connected && cfg ? (
          <span
            className={`chip mono ${pipeline_healthy ? "ok" : "warn"}`}
            title={cfg.codex_model ? `${executor_label}: ${cfg.codex_model}${cfg.codex_reasoning_effort ? ` (reasoning ${cfg.codex_reasoning_effort})` : ""}` : undefined}
          >
            {no_executor ? "no execution agent" : `${executor_label} worker ${worker_on ? "on" : "off"}`}
            {!is_compact_layout && cfg.codex_model ? ` · ${cfg.codex_model}` : ""}
          </span>
        ) : null}
        {!gateway_connected ? <span className="page_hint">Not connected — use the connection control (top right).</span> : null}
        {!unconfigured && pipeline.exec_error ? <span className="page_error mono">{pipeline.exec_error}</span> : null}
        <div className="page_toolbar_spacer" />
        <button
          className={`btn btn_icon ${pipeline.exec_loading ? "is_loading" : ""}`}
          onClick={() => {
            void pipeline.refresh_exec_list("processing");
            void refresh_recent();
            // The callout's inputs refresh too — an admin who fixed the
            // config out-of-band and clicked Refresh kept a lying callout
            // until navigating away (adversary find).
            void pipeline.load_exec_config();
            void refetch_registry();
          }}
          disabled={!gateway_connected || pipeline.exec_loading}
          title="Refresh runs, worker config, and the executor registry"
          aria-label="Refresh"
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {gateway_connected && cfg && !pipeline_healthy && !unconfigured ? (
        <div className="callout callout_warn">
          <div className="callout_icon" aria-hidden="true">
            <Icon name="warning" size={18} />
          </div>
          <div className="callout_main">
            <div className="callout_title">
              {no_executor
                ? registry?.length
                  ? "No default executor selected"
                  : "No execution agent on this gateway"
                : worker_on
                  ? "The pipeline cannot execute"
                  : "The exec worker is not running"}
              <span className="chip mono warn">{no_executor ? "setup required" : worker_on ? "cannot execute" : "queued until it returns"}</span>
            </div>
            <p className="callout_text">
              {(() => {
                if (!no_executor) {
                  return cfg.runner_error
                    ? `The worker reports: ${cfg.runner_error} — new executions queue until it comes back.`
                    : worker_on
                      ? "The worker is alive but the gateway reports it cannot execute — check the executor configuration below."
                      : "New executions will queue until the worker comes back.";
                }
                if (!registry?.length) {
                  return "The gateway serves the pipeline but has no executor configured — nothing can run until one is enabled on the gateway host.";
                }
                const names = registry.map((x) => x.display || x.id);
                const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? ` +${names.length - 4} more` : "");
                const any_available = registry.some((x) => x.available !== false);
                // All-unavailable: "pick one in Settings" would instruct an
                // impossible act (the dropdown disables unavailable rows) —
                // the honest fix is a binary on the gateway host (adversary
                // find: this branch re-created the contradiction class).
                return any_available
                  ? `The gateway's registry serves ${registry.length} executor${registry.length === 1 ? "" : "s"} (${shown}), but no default is selected — pick one in Settings → Gateway administration (gateway admin).`
                  : `The gateway's registry serves ${registry.length} executor${registry.length === 1 ? "" : "s"} (${shown}), but none is currently available — install an executor binary on the gateway host (PATH), then pick it in Settings.`;
              })()}
            </p>
            {/* Terminal recipe when the admin surface has nothing usable to
                offer: registry absent (older gateway) OR every agent
                unavailable (the fix is host-side either way). Settings and
                CLI flags only — never environment variables (operator rule). */}
            {(!registry?.length || !registry.some((x) => x.available !== false)) && (no_executor || !worker_on) ? (
              <pre className="mono setup_callout_pre">
                {
                  "abstractgateway config set backlog_exec_runner on   # enables the exec worker\nabstractgateway config set executor codex            # canonical ids: codex | claude | cursor-agent | abstractcode\n# the agent program must be installed on the gateway's computer (on its PATH)"
                }
              </pre>
            ) : null}
            <div className="callout_actions">
              {props.on_open_settings ? (
                <button className="btn primary" onClick={props.on_open_settings} title="Settings → Gateway administration (admin-gated; the gateway authorizes every change)">
                  Open Settings
                </button>
              ) : null}
            </div>
            <p className="callout_text muted">
              The gateway is the gatekeeper: admins enable the worker and pick the executor from Settings → Gateway administration — changes
              apply live, no gateway restart (the worker reconciles in-process). On the gateway's computer the same settings are{" "}
              <code>abstractgateway config set …</code>.
            </p>
          </div>
        </div>
      ) : null}

      {unconfigured ? (
        <BacklogUnavailablePanel
          gateway={gateway}
          surface="the execution pipeline"
          status={backlog_folder.status}
          legacy={backlog_folder.legacy}
          error={is_backlog_unavailable(pipeline.exec_error) ? pipeline.exec_error : recent_error}
          on_changed={() => {
            set_folder_nonce((n) => n + 1);
            void pipeline.refresh_exec_list("processing");
          }}
        />
      ) : (
        <>
          <div className="stat_strip">
            <div className={`stat_card ${counts.running ? "tone_info" : ""}`}>
              <span className="stat_value">{counts.running}</span>
              <span className="stat_label">running</span>
            </div>
            <div className={`stat_card ${counts.awaiting ? "tone_warn" : ""}`}>
              <span className="stat_value">{counts.awaiting}</span>
              <span className="stat_label">awaiting QA</span>
            </div>
            <div className="stat_card">
              <span className="stat_value">{counts.queued}</span>
              <span className="stat_label">queued</span>
            </div>
            <div className={`stat_card ${pipeline_healthy ? "tone_ok" : "tone_danger"}`}>
              <span className="stat_value">{pipeline_healthy ? "on" : no_executor ? "none" : "off"}</span>
              <span className="stat_label">{executor_label}{no_executor ? "" : " worker"}</span>
            </div>
          </div>

          <div className="inbox_layout exec_layout">
            {show_compact_list ? (
              <div className="exec_side">
                <div className="pane exec_pane_active">
                  <div className="pane_header">
                    <span className="pane_title">Active</span>
                    <span className="pane_count">{active.length}</span>
                  </div>
                  <div className="pane_body pane_body_list">
                    {active.length ? (
                      active.map((r) => {
                        const st = String(r.status || "").trim().toLowerCase();
                        const stats = exec_time_stats(r);
                        const selected = pipeline.exec_selected?.request_id === r.request_id;
                        const live_ms = st === "running" && r.started_at ? Math.max(0, Date.now() - Date.parse(r.started_at)) : null;
                        const file = String(r.backlog_filename || r.backlog_relpath || "").trim();
                        const agent_label = r.target_agent || (r.target_model ? `${String((r as any).executor_type || "agent").trim() || "agent"}:${r.target_model}` : "");
                        return (
                          <button
                            key={r.request_id}
                            className={`run_card ${selected ? "selected" : ""} ${st === "running" ? "is_running" : ""}`}
                            onClick={() => void pipeline.load_exec_request(r)}
                          >
                            <div className="run_card_head">
                              <span className="run_card_title" title={file}>
                                {file || `request ${short_id(r.request_id, 12)}`}
                              </span>
                              <span className={`chip mono ${exec_status_chip_class(st)}`}>{st || "unknown"}</span>
                            </div>
                            <div className="run_card_meta">
                              <span className="run_card_time">
                                {live_ms !== null
                                  ? `running ${format_duration_ms(live_ms)}`
                                  : stats.queue_delay_ms != null
                                    ? `queued ${format_duration_ms(stats.queue_delay_ms)}`
                                    : "\u00a0"}
                              </span>
                              {agent_label ? <span className="chip mono muted">{agent_label}</span> : null}
                              <span className="run_card_id mono">{short_id(r.request_id, 14)}</span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="empty_note">Nothing is executing right now. Execute a Ready item from the Board (or Backlog).</div>
                    )}
                  </div>
                </div>

                <div className="pane exec_pane_recent">
                  <div className="pane_header">
                    <span className="pane_title">Recently finished</span>
                    <span className="pane_count">{recent.length}</span>
                  </div>
                  <div className="pane_body" style={{ padding: 0 }}>
                    {recent_error && !unconfigured ? (
                      <div className="page_error mono" style={{ padding: "10px 12px" }}>
                        {recent_error}
                      </div>
                    ) : null}
                    {!recent_error && !recent.length ? <div className="empty_note" style={{ padding: "10px 12px" }}>No finished executions yet.</div> : null}
                    {recent.length ? (
                      <div className="recent_list">
                        {recent.map((r) => {
                          const st = String(r.status || "").trim().toLowerCase();
                          const stats = exec_time_stats(r);
                          const selected = pipeline.exec_selected?.request_id === r.request_id;
                          const file = short_id(r.backlog_filename || r.backlog_relpath || "request", 44);
                          return (
                            <button
                              key={`recent:${r.request_id}`}
                              className={`recent_row ${selected ? "selected" : ""}`}
                              onClick={() => void pipeline.load_exec_request(r)}
                              title={String(r.backlog_filename || r.backlog_relpath || r.request_id)}
                            >
                              <span className={`chip mono ${exec_status_chip_class(st)}`}>{st || "?"}</span>
                              <span className="recent_row_name">{file}</span>
                              <span className="recent_row_time mono">{stats.run_ms != null ? format_duration_ms(stats.run_ms) : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {show_compact_detail ? (
              <div className="pane">
                <div className="pane_header">
                  <span className="pane_title">Run detail</span>
                  {pipeline.exec_selected ? (
                    <>
                      <span className={`chip mono ${exec_status_chip_class(String(pipeline.exec_selected.status || "").toLowerCase())}`}>
                        {String(pipeline.exec_selected.status || "?").toLowerCase()}
                      </span>
                      <span className="pane_count mono">{short_id(pipeline.exec_selected.request_id, 20)}</span>
                    </>
                  ) : (
                    <span className="pane_count">select a run</span>
                  )}
                </div>
                <div className="pane_body">
                  <ExecDetailPane
                    pipeline={pipeline}
                    is_compact_layout={is_compact_layout}
                    on_back_to_list={() => set_compact_pane("list")}
                    on_send_feedback={() =>
                      void pipeline.exec_send_feedback(async () => {
                        await pipeline.refresh_exec_list("processing");
                      })
                    }
                    on_promote={() =>
                      void pipeline.exec_promote_to_prod(async () => {
                        await pipeline.refresh_exec_list("processing");
                        await refresh_recent();
                      })
                    }
                    on_deploy_uat={() =>
                      void pipeline.exec_deploy_uat_now(async () => {
                        await pipeline.refresh_exec_list("processing");
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
