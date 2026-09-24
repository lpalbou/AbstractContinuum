import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GatewayClient, ManagedEnvVarItem, ManagedProcessInfo } from "../lib/gateway_client";
import { Modal } from "./modal";
import { Icon } from "@abstractframework/ui-kit";

function clamp(text: string, max_chars: number): string {
  const s = String(text || "");
  if (s.length <= max_chars) return s;
  return `${s.slice(0, Math.max(0, max_chars - 1))}…`;
}

function status_chip(status: string): { cls: string; label: string } {
  const s = String(status || "").trim().toLowerCase();
  if (s === "running") return { cls: "ok", label: "running" };
  if (s === "stopped") return { cls: "muted", label: "stopped" };
  if (s.includes("restart")) return { cls: "warn", label: s };
  if (s.includes("error") || s.includes("failed")) return { cls: "danger", label: s || "error" };
  return { cls: "warn", label: s || "unknown" };
}

function sort_processes(items: ManagedProcessInfo[]): ManagedProcessInfo[] {
  const rank = (p: ManagedProcessInfo): number => {
    const id = String(p?.id || "").trim();
    const base = id.endsWith("_uat") ? id.slice(0, -4) : id;
    if (base === "gateway") return 0;
    if (base === "build") return 1;
    if (base === "abstractobserver") return 2;
    if (base === "abstractcode_web") return 3;
    if (base === "abstractflow_backend") return 4;
    if (base === "abstractflow_frontend") return 5;
    return 10;
  };
  return [...(items || [])].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const la = String(a?.label || a?.id || "").toLowerCase();
    const lb = String(b?.label || b?.id || "").toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}

function env_source_chip(source: string): { cls: string; label: string } {
  const s = String(source || "").trim().toLowerCase();
  if (s === "override") return { cls: "ok", label: "override" };
  if (s.startsWith("inherited")) return { cls: "info", label: s };
  if (s === "unset") return { cls: "warn", label: "unset" };
  if (!s || s === "missing") return { cls: "muted", label: "missing" };
  return { cls: "muted", label: s };
}

export function ProcessesPage({
  gateway,
  gateway_connected,
}: {
  gateway: GatewayClient;
  gateway_connected: boolean;
}): React.ReactElement {
  const [tab, set_tab] = useState<"prod" | "uat" | "env">("prod");
  const [enabled, set_enabled] = useState<boolean | null>(null);
  const [items, set_items] = useState<ManagedProcessInfo[]>([]);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState<string>("");
  const [auto_refresh, set_auto_refresh] = useState(false);

  const [env_enabled, set_env_enabled] = useState<boolean | null>(null);
  const [env_items, set_env_items] = useState<ManagedEnvVarItem[]>([]);
  const [env_loading, set_env_loading] = useState(false);
  const [env_error, set_env_error] = useState<string>("");
  const [env_inputs, set_env_inputs] = useState<Record<string, string>>({});

  const [log_open, set_log_open] = useState(false);
  const [log_target, set_log_target] = useState<ManagedProcessInfo | null>(null);
  const [log_text, set_log_text] = useState<string>("");
  const [log_meta, set_log_meta] = useState<string>("");
  const [log_loading, set_log_loading] = useState(false);
  const log_refresh_timer = useRef<number | null>(null);

  const prod_items = useMemo(
    () => sort_processes(items.filter((p) => !String((p as any)?.id || "").trim().endsWith("_uat"))),
    [items]
  );
  const uat_items = useMemo(() => sort_processes(items.filter((p) => String((p as any)?.id || "").trim().endsWith("_uat"))), [items]);
  const visible_items = tab === "uat" ? uat_items : prod_items;

  const refresh = useCallback(async () => {
    if (!gateway_connected) return;
    set_loading(true);
    set_error("");
    try {
      const body = await gateway.list_processes();
      set_enabled(Boolean((body as any)?.enabled));
      const procs = Array.isArray((body as any)?.processes) ? ((body as any).processes as ManagedProcessInfo[]) : [];
      set_items(procs);
    } catch (e: any) {
      set_error(String(e?.message || e || "Failed to list processes"));
    } finally {
      set_loading(false);
    }
  }, [gateway, gateway_connected]);

  const refresh_env = useCallback(async () => {
    if (!gateway_connected) return;
    set_env_loading(true);
    set_env_error("");
    try {
      const body = await gateway.list_process_env_vars();
      set_env_enabled(Boolean((body as any)?.enabled));
      const vars0 = Array.isArray((body as any)?.vars) ? ((body as any).vars as ManagedEnvVarItem[]) : [];
      set_env_items(vars0);
      const err = String((body as any)?.error || "").trim();
      if (err) set_env_error(err);
    } catch (e: any) {
      set_env_error(String(e?.message || e || "Failed to list env vars"));
    } finally {
      set_env_loading(false);
    }
  }, [gateway, gateway_connected]);

  const refresh_log = useCallback(async () => {
    if (!gateway_connected) return;
    const p = log_target;
    if (!p) return;
    set_log_loading(true);
    try {
      const body = await gateway.process_log_tail(String(p.id || ""), { max_bytes: 160000 });
      const text = String((body as any)?.content || "");
      const bytes = typeof (body as any)?.bytes === "number" ? Number((body as any).bytes) : 0;
      const truncated = Boolean((body as any)?.truncated);
      const rel = String((body as any)?.log_relpath || "");
      set_log_text(text);
      set_log_meta(`${bytes.toLocaleString()} bytes${truncated ? " (tail)" : ""}${rel ? ` • ${rel}` : ""}`);
    } catch (e: any) {
      set_log_text("");
      // Surface INSIDE the modal (the page error slot renders behind it —
      // adversarial P2 2026-07-13).
      set_log_meta(String(e?.message || e || "Failed to read logs"));
    } finally {
      set_log_loading(false);
    }
  }, [gateway, gateway_connected, log_target]);

  const open_logs = useCallback(
    async (p: ManagedProcessInfo) => {
      set_log_target(p);
      set_log_open(true);
    },
    []
  );

  const close_logs = useCallback(() => {
    set_log_open(false);
    set_log_target(null);
    set_log_text("");
    set_log_meta("");
  }, []);

  useEffect(() => {
    if (!gateway_connected) return;
    void refresh();
  }, [gateway_connected, refresh]);

  useEffect(() => {
    if (!gateway_connected) return;
    if (tab === "env") return;
    if (!auto_refresh) return;
    // Stand down while the shared-IP gateway lock is warm (incident
    // 2026-07-15) — Services' 2s poll ties the exec list as continuum's
    // heaviest lock-warming contributor.
    const id = window.setInterval(() => {
      if (gateway.is_backing_off()) return;
      void refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [gateway_connected, tab, auto_refresh, refresh, gateway]);

  useEffect(() => {
    if (!gateway_connected) return;
    if (tab !== "env") return;
    void refresh_env();
  }, [gateway_connected, tab, refresh_env]);

  useEffect(() => {
    if (!gateway_connected) return;
    if (!log_open) return;
    void refresh_log();
    if (log_refresh_timer.current) window.clearInterval(log_refresh_timer.current);
    log_refresh_timer.current = window.setInterval(() => {
      if (gateway.is_backing_off()) return; // stand down during a 429 lockout
      void refresh_log();
    }, 1500);
    return () => {
      if (log_refresh_timer.current) window.clearInterval(log_refresh_timer.current);
      log_refresh_timer.current = null;
    };
  }, [gateway_connected, log_open, refresh_log]);

  const action_inflight_ref = useRef(false);
  const [action_busy, set_action_busy] = useState(false);

  async function run_action(p: ManagedProcessInfo, action: "start" | "stop" | "restart" | "redeploy"): Promise<void> {
    // In-flight guard: a double-click on Start/Restart must not fire the
    // HIGH-TRUST action twice (adversarial P2 2026-07-13; buttons were only
    // disabled by the unrelated list loading flag).
    if (action_inflight_ref.current) return;
    action_inflight_ref.current = true;
    set_action_busy(true);
    set_error("");
    try {
      if (action === "start") await gateway.start_process(p.id);
      else if (action === "stop") await gateway.stop_process(p.id);
      else if (action === "restart") await gateway.restart_process(p.id);
      else if (action === "redeploy") await gateway.redeploy_process(p.id);
      await refresh();
    } catch (e: any) {
      set_error(String(e?.message || e || `Failed to ${action}`));
    } finally {
      action_inflight_ref.current = false;
      set_action_busy(false);
    }
  }

  async function env_set(key: string): Promise<void> {
    const k = String(key || "").trim();
    if (!k) return;
    set_env_error("");
    try {
      const value = String(env_inputs?.[k] ?? "");
      const body = await gateway.update_process_env_vars({ set: { [k]: value } });
      set_env_enabled(Boolean((body as any)?.enabled));
      set_env_items(Array.isArray((body as any)?.vars) ? ((body as any).vars as ManagedEnvVarItem[]) : []);
      set_env_inputs((prev) => ({ ...(prev || {}), [k]: "" }));
      const err = String((body as any)?.error || "").trim();
      if (err) set_env_error(err);
    } catch (e: any) {
      set_env_error(String(e?.message || e || "Failed to set env var"));
    }
  }

  async function env_unset(key: string): Promise<void> {
    const k = String(key || "").trim();
    if (!k) return;
    set_env_error("");
    try {
      const body = await gateway.update_process_env_vars({ unset: [k] });
      set_env_enabled(Boolean((body as any)?.enabled));
      set_env_items(Array.isArray((body as any)?.vars) ? ((body as any).vars as ManagedEnvVarItem[]) : []);
      set_env_inputs((prev) => ({ ...(prev || {}), [k]: "" }));
      const err = String((body as any)?.error || "").trim();
      if (err) set_env_error(err);
    } catch (e: any) {
      set_env_error(String(e?.message || e || "Failed to unset env var"));
    }
  }

  const enabled_label = enabled === null ? "…" : enabled ? "enabled" : "disabled";
  const env_enabled_label = env_enabled === null ? "…" : env_enabled ? "enabled" : "disabled";

  return (
    <div className="page page_scroll">
      <div className="page_inner page_pad constrained">
        <div className="page_toolbar">
          <div className="seg" role="group" aria-label="Service views">
            <button aria-pressed={tab === "prod"} className={`seg_btn ${tab === "prod" ? "active" : ""}`} onClick={() => set_tab("prod")}>
              Production
            </button>
            <button aria-pressed={tab === "uat"} className={`seg_btn ${tab === "uat" ? "active" : ""}`} onClick={() => set_tab("uat")}>
              UAT
            </button>
            <button aria-pressed={tab === "env"} className={`seg_btn ${tab === "env" ? "active" : ""}`} onClick={() => set_tab("env")}>
              ENV
            </button>
          </div>
          {!gateway_connected ? <span className="page_hint mono">Not connected — use the connection badge in the sidebar.</span> : null}
          {gateway_connected && tab !== "env" ? (
            <span className={`chip mono ${enabled === false ? "warn" : "muted"}`}>manager {enabled_label}</span>
          ) : null}
          {gateway_connected && tab === "env" ? (
            <span className={`chip mono ${env_enabled === false ? "warn" : "muted"}`}>env {env_enabled_label}</span>
          ) : null}
          <div className="page_toolbar_spacer" />
          {tab !== "env" ? (
            <>
              <label className="btn btn_icon" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" checked={auto_refresh} onChange={(e) => set_auto_refresh(Boolean(e.target.checked))} />
                auto
              </label>
              <button className={`btn btn_icon ${loading ? "is_loading" : ""}`} onClick={() => void refresh()} disabled={!gateway_connected || loading}>
                <Icon name="refresh" size={16} />
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </>
          ) : (
            <button className={`btn btn_icon ${env_loading ? "is_loading" : ""}`} onClick={() => void refresh_env()} disabled={!gateway_connected || env_loading}>
              <Icon name="refresh" size={16} />
              {env_loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>

        {gateway_connected && tab !== "env" && enabled === false ? (
          <div className="page_hint mono">
            The process manager is off on this gateway. An admin turns it on in Settings → Gateway administration (or{" "}
            <span className="mono">abstractgateway config set process_manager on</span>). Process control also needs the framework
            checkout it manages: set the backlog folder to it (Settings → Backlog folder).
          </div>
        ) : null}
        {gateway_connected && tab === "env" && env_enabled === false ? (
          <div className="page_hint mono">
            The process manager is off on this gateway. An admin turns it on in Settings → Gateway administration (or{" "}
            <span className="mono">abstractgateway config set process_manager on</span>).
          </div>
        ) : null}
        {tab !== "env" && error ? <div className="page_error mono">{error}</div> : null}
        {tab === "env" && env_error ? <div className="page_error mono">{env_error}</div> : null}

        {gateway_connected && tab !== "env" ? (
          <div className="pane">
            <div className="pane_header">
              <span className="pane_title">{tab === "uat" ? "UAT services" : "Production services"}</span>
              <span className="pane_count">{visible_items.length}</span>
            </div>
            <div className="pane_body pane_body_list">
              {!visible_items.length ? (
                <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", padding: "6px 4px" }}>
                  No {tab === "uat" ? "UAT" : "production"} processes reported.
                </div>
              ) : null}
              {visible_items.map((p) => {
                const id = String(p.id || "").trim();
                const label = String(p.label || id).trim() || id;
                const s = status_chip(String(p.status || ""));
                const status_raw = String(p.status || "").trim().toLowerCase();
                const is_running = status_raw === "running";
                const actions = Array.isArray((p as any)?.actions) ? ((p as any).actions as any[]).map((x) => String(x || "").trim()) : [];
                const can_start = actions.includes("start");
                const can_stop = actions.includes("stop");
                const can_restart = actions.includes("restart");
                const can_redeploy = actions.includes("redeploy");
                const can_logs = actions.includes("logs");
                const pid = typeof (p as any)?.pid === "number" ? Number((p as any).pid) : null;
                const url = String((p as any)?.url || "").trim();
                const desc = String((p as any)?.description || "").trim();
                const err0 = String((p as any)?.last_error || "").trim();
                const exit_code = typeof (p as any)?.exit_code === "number" ? Number((p as any).exit_code) : null;
                const subtitle_bits: string[] = [];
                if (pid) subtitle_bits.push(`pid ${pid}`);
                if (exit_code !== null) subtitle_bits.push(`exit ${exit_code}`);
                const subtitle = subtitle_bits.join(" • ");

                return (
                  <div key={id} className="entity_card">
                    <div className="entity_card_head">
                      <span className="entity_card_title">{label}</span>
                      <span className={`chip mono ${s.cls}`}>{s.label}</span>
                      <span className="chip mono muted">{id}</span>
                      {subtitle ? <span className="entity_card_sub mono">{subtitle}</span> : null}
                    </div>
                    {desc ? <div className="entity_card_sub mono">{clamp(desc, 220)}</div> : null}
                    {url ? (
                      <div className="entity_card_sub mono">
                        {is_running ? (
                          <a href={url} target="_blank" rel="noreferrer" className="mono" style={{ opacity: 0.95 }}>
                            {url}
                          </a>
                        ) : (
                          <span className="mono">{url}</span>
                        )}
                      </div>
                    ) : null}
                    {err0 ? <div className="page_error mono">{clamp(err0, 360)}</div> : null}
                    <div className="entity_card_actions">
                      {can_start ? (
                        <button className="btn primary" onClick={() => void run_action(p, "start")} disabled={loading || action_busy}>
                          Start
                        </button>
                      ) : null}
                      {can_stop ? (
                        <button className="btn danger" onClick={() => void run_action(p, "stop")} disabled={loading || action_busy}>
                          Stop
                        </button>
                      ) : null}
                      {can_restart ? (
                        <button className="btn" onClick={() => void run_action(p, "restart")} disabled={loading || action_busy}>
                          Restart
                        </button>
                      ) : null}
                      {can_redeploy ? (
                        <button className="btn" onClick={() => void run_action(p, "redeploy")} disabled={loading || action_busy}>
                          Redeploy
                        </button>
                      ) : null}
                      {can_logs ? (
                        <button className="btn" onClick={() => void open_logs(p)} disabled={loading}>
                          Logs
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {gateway_connected && tab === "env" ? (
          <div className="pane">
            <div className="pane_header">
              <span className="pane_title">Environment variables</span>
              <span className="pane_count">{env_items.length}</span>
              <span className="pane_header_actions mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                write-only: the gateway will never return env var values to the browser
              </span>
            </div>
            <div className="pane_body pane_body_list">
              {env_items.map((it) => {
                const key = String((it as any)?.key || "").trim();
                if (!key) return null;
                const label = String((it as any)?.label || key).trim() || key;
                const desc = String((it as any)?.description || "").trim();
                const source = String((it as any)?.source || "").trim();
                const secret = Boolean((it as any)?.secret);
                const updated_at = String((it as any)?.updated_at || "").trim();
                const chip = env_source_chip(source);
                const v = String(env_inputs?.[key] ?? "");

                return (
                  <div key={`env:${key}`} className="entity_card">
                    <div className="entity_card_head">
                      <span className="entity_card_title">{label}</span>
                      <span className={`chip mono ${chip.cls}`}>{chip.label}</span>
                      <span className="chip mono muted">{key}</span>
                    </div>
                    {desc ? <div className="entity_card_sub mono">{clamp(desc, 280)}</div> : null}
                    {updated_at ? <div className="entity_card_sub mono">updated {updated_at}</div> : null}
                    <div className="entity_card_actions">
                      <input
                        className="input"
                        value={v}
                        onChange={(e) => set_env_inputs((prev) => ({ ...(prev || {}), [key]: String(e.target.value || "") }))}
                        placeholder={secret ? "••••••••" : "value"}
                        type={secret ? "password" : "text"}
                        style={{ flex: "1 1 320px", minWidth: "220px" }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button className="btn primary" onClick={() => void env_set(key)} disabled={env_loading}>
                        Set
                      </button>
                      <button className="btn" onClick={() => void env_unset(key)} disabled={env_loading}>
                        Unset
                      </button>
                    </div>
                  </div>
                );
              })}
              {!env_items.length ? (
                <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", padding: "6px 4px" }}>
                  No env vars available (process manager must be enabled).
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {log_open && log_target ? (
          <Modal open={log_open} title={`${String(log_target.label || log_target.id || "logs").trim() || "Logs"}`} onClose={close_logs}>
            <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
              {log_meta}
            </div>
            <div className="actions" style={{ marginTop: "10px" }}>
              <button className={`btn btn_icon ${log_loading ? "is_loading" : ""}`} onClick={() => void refresh_log()} disabled={log_loading}>
                <Icon name="refresh" size={16} />
                {log_loading ? "Refreshing…" : "Refresh"}
              </button>
              <button
                className="btn btn_icon"
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(log_text || "");
                  } catch {
                    // ignore
                  }
                }}
                disabled={!log_text}
              >
                <Icon name="copy" size={16} />
                Copy
              </button>
            </div>
            <pre
              className="mono"
              style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.22)",
                overflowX: "auto",
                maxHeight: "55vh",
                whiteSpace: "pre-wrap",
              }}
            >
              {log_text || "(no logs yet)"}
            </pre>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}
