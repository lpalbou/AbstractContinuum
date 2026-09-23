// State + actions for the codex EXEC PIPELINE concern: worker config,
// request listing + polling, request detail, QA actions (feedback /
// promote / deploy-UAT), and the live log tail with follow-scroll.
//
// Extracted behavior-preserving from the pre-split backlog_browser.tsx
// (2026-07-12). The hook is view-agnostic: the backlog page drives it from
// its Processing/Failed/Completed-runs tabs, and the missions (pipeline)
// surface reuses it standalone.
import { useEffect, useMemo, useRef, useState } from "react";

import type { BacklogExecConfigResponse, BacklogExecRequestListResponse, BacklogExecRequestSummary, GatewayClient } from "../../lib/gateway_client";
import {
  type BacklogTab,
  type ExecLogName,
  exec_event_stats,
  exec_status_filter_for_view,
  exec_summary_from_payload,
  exec_time_stats,
  parse_exec_events,
} from "./model";

export type ExecPipelineApi = ReturnType<typeof use_exec_pipeline>;

export function use_exec_pipeline(opts: {
  gateway: GatewayClient;
  can_use_gateway: boolean;
  /** Current backlog tab (drives the status filter + poll cadence). */
  kind: BacklogTab;
  completed_view: "tasks" | "runs";
  /** True when the current view lists exec requests (drives polling). */
  is_exec_view: boolean;
  is_compact_layout: boolean;
  set_compact_pane: (pane: "list" | "detail") => void;
  /**
   * Called when a selected Processing request reaches a terminal status so
   * the page can transfer the user to the Failed / Completed-runs tab (tab
   * state lives in the page).
   */
  on_status_transfer: (status: "failed" | "completed" | "promoted") => void;
}) {
  const { gateway, can_use_gateway, kind, completed_view, is_exec_view, is_compact_layout, set_compact_pane, on_status_transfer } = opts;

  const [exec_cfg, set_exec_cfg] = useState<BacklogExecConfigResponse | null>(null);
  const [exec_cfg_loading, set_exec_cfg_loading] = useState(false);
  const [exec_cfg_error, set_exec_cfg_error] = useState("");

  const [exec_requests, set_exec_requests] = useState<BacklogExecRequestSummary[]>([]);
  const [exec_loading, set_exec_loading] = useState(false);
  const [exec_error, set_exec_error] = useState("");
  const [exec_selected, set_exec_selected] = useState<BacklogExecRequestSummary | null>(null);
  const [exec_detail, set_exec_detail] = useState<any>(null);
  const [exec_detail_loading, set_exec_detail_loading] = useState(false);
  const [exec_detail_error, set_exec_detail_error] = useState("");
  const [exec_qa_feedback, set_exec_qa_feedback] = useState("");
  const [exec_qa_loading, set_exec_qa_loading] = useState(false);
  const [exec_qa_error, set_exec_qa_error] = useState("");

  const [exec_log_name, set_exec_log_name] = useState<ExecLogName>("events");
  const [exec_log_text, set_exec_log_text] = useState("");
  const [exec_log_loading, set_exec_log_loading] = useState(false);
  const [exec_log_error, set_exec_log_error] = useState("");
  const [exec_log_truncated, set_exec_log_truncated] = useState(false);
  const [exec_log_auto, set_exec_log_auto] = useState(true);
  const exec_log_scroll_el_ref = useRef<HTMLDivElement | null>(null);
  const exec_log_follow_ref = useRef(true);
  // Byte-cursor follow state (gateway after_bytes contract, 2026-07-12).
  // Keyed by request+log so a stale cursor never crosses follows; null
  // cursor = the connected gateway predates the contract (#FALLBACK to
  // whole-tail polling).
  const exec_log_cursor_ref = useRef<{ key: string; offset: number } | null>(null);
  // In-flight guards MUST be refs, not state: the polling intervals capture
  // load functions from the effect-setup render, so a state-based guard is
  // a dead closure (permanently false inside the interval). With cursor
  // appends an overlapping fetch would double-append the same delta.
  const exec_log_inflight_ref = useRef(false);
  const exec_list_inflight_ref = useRef(false);
  // Client-side cap for the accumulated follow buffer (the full log stays
  // one click away in the full-log modal). Trimming sets the truncation
  // flag so the UI labels the partial view.
  const EXEC_LOG_BUFFER_CAP = 1_000_000;

  const parsed_exec_events = useMemo(() => {
    if (exec_log_name !== "events") return null;
    return parse_exec_events(exec_log_text);
  }, [exec_log_text, exec_log_name]);

  const event_stats = useMemo(() => exec_event_stats(parsed_exec_events), [parsed_exec_events]);

  // Deliberately NOT memoized: for a running request the inputs are stable
  // between polls, but "age"/"run_time" must tick — each poll's state write
  // re-renders and re-reads Date.now() here. The computation is trivial.
  const time_stats = exec_time_stats(exec_selected);

  function clear_exec_selection(): void {
    set_exec_selected(null);
    set_exec_detail(null);
    set_exec_detail_error("");
    set_exec_log_text("");
    set_exec_log_error("");
    set_exec_log_truncated(false);
    exec_log_cursor_ref.current = null;
  }

  async function load_exec_config(): Promise<BacklogExecConfigResponse | null> {
    if (!can_use_gateway) return null;
    if (exec_cfg_loading) return exec_cfg;
    set_exec_cfg_error("");
    set_exec_cfg_loading(true);
    try {
      const out = await gateway.backlog_exec_config();
      set_exec_cfg(out);
      return out;
    } catch (e: any) {
      const msg = String(e?.message || e || "Failed to load backlog exec config");
      set_exec_cfg_error(msg);
      set_exec_cfg(null);
      return null;
    } finally {
      set_exec_cfg_loading(false);
    }
  }

  async function refresh_exec_list(
    target_tab?: BacklogTab,
    target_completed_view?: "tasks" | "runs",
    opts?: { background?: boolean }
  ): Promise<BacklogExecRequestSummary[]> {
    if (exec_list_inflight_ref.current) return exec_requests;
    exec_list_inflight_ref.current = true;
    // Background polls must not flip Refresh into a 2s "Refreshing…"
    // flicker-and-disable loop (adversarial P2 2026-07-13 — the board's
    // use_board_data fixed this class already).
    if (!opts?.background) set_exec_loading(true);
    const tab = target_tab || kind;
    try {
      const status = exec_status_filter_for_view(tab, target_completed_view || completed_view);
      const res = (await gateway.backlog_exec_requests({ status, limit: 200 })) as BacklogExecRequestListResponse;
      const next = Array.isArray(res?.requests) ? res.requests : [];
      // Clear the error only on SUCCESS — clearing at call start made the
      // banner blink on every 2s poll against a persistently failing
      // gateway (adversarial P2 2026-07-13).
      set_exec_error("");
      set_exec_requests(next);

      // Auto-transfer the selected request out of Processing when it
      // completes. Skip when the selection is ALREADY terminal: on the
      // Executions page (pinned to processing, terminal selections allowed
      // from the recent strip) the missing-from-list condition is permanent,
      // and re-probing turned every 2s poll into a detail fetch + transfer
      // callback storm (adversarial P1 2026-07-13).
      const selected_status = String(exec_selected?.status || "").trim().toLowerCase();
      const selected_is_terminal = selected_status === "failed" || selected_status === "completed" || selected_status === "promoted";
      if (tab === "processing" && exec_selected?.request_id && !selected_is_terminal && !next.some((r) => r.request_id === exec_selected.request_id)) {
        try {
          const detail = await gateway.backlog_exec_request(exec_selected.request_id);
          const payload = detail?.payload;
          const status2 = String(payload?.status || "").trim().toLowerCase();
          if (status2 === "failed" || status2 === "completed" || status2 === "promoted") {
            on_status_transfer(status2 as any);
            set_exec_detail(payload);
            set_exec_selected(exec_summary_from_payload(payload, exec_selected.request_id));
          }
        } catch {
          // ignore
        }
      }

      // Keep selection in sync.
      if (exec_selected?.request_id) {
        const match = next.find((r) => r.request_id === exec_selected.request_id) || null;
        if (match) set_exec_selected(match);
      }

      return next;
    } catch (e: any) {
      // Keep the previous list on transient poll failures (the error banner
      // reports the problem); blanking it made the view flicker empty on
      // every failed 2s poll against a flaky gateway.
      set_exec_error(String(e?.message || e || "Failed to load backlog exec requests"));
      return [];
    } finally {
      exec_list_inflight_ref.current = false;
      if (!opts?.background) set_exec_loading(false);
    }
  }

  async function load_exec_request(req: BacklogExecRequestSummary): Promise<void> {
    if (!can_use_gateway) return;
    set_exec_selected(req);
    if (is_compact_layout) set_compact_pane("detail");
    set_exec_detail(null);
    set_exec_detail_error("");
    set_exec_detail_loading(true);
    set_exec_qa_error("");
    set_exec_qa_feedback("");
    set_exec_log_text("");
    set_exec_log_error("");
    set_exec_log_truncated(false);
    exec_log_cursor_ref.current = null;
    try {
      const out = await gateway.backlog_exec_request(req.request_id);
      set_exec_detail(out?.payload ?? null);
    } catch (e: any) {
      set_exec_detail_error(String(e?.message || e || "Failed to load request"));
    } finally {
      set_exec_detail_loading(false);
    }
  }

  async function exec_send_feedback(on_done: () => Promise<void>): Promise<void> {
    if (!can_use_gateway) return;
    const rid = String(exec_selected?.request_id || "").trim();
    if (!rid) return;
    if (exec_qa_loading) return;
    const text = String(exec_qa_feedback || "");
    if (!text.trim()) {
      set_exec_qa_error("Feedback is required.");
      return;
    }
    set_exec_qa_error("");
    set_exec_qa_loading(true);
    try {
      const out = await gateway.backlog_exec_feedback({ request_id: rid, feedback: text });
      const payload = out?.payload ?? null;
      set_exec_detail(payload);
      if (payload) set_exec_selected(exec_summary_from_payload(payload, rid));
      set_exec_qa_feedback("");
      await on_done();
    } catch (e: any) {
      set_exec_qa_error(String(e?.message || e || "Failed to send feedback"));
    } finally {
      set_exec_qa_loading(false);
    }
  }

  async function exec_promote_to_prod(on_done: () => Promise<void>): Promise<void> {
    if (!can_use_gateway) return;
    const rid = String(exec_selected?.request_id || "").trim();
    if (!rid) return;
    if (exec_qa_loading) return;
    set_exec_qa_error("");
    set_exec_qa_loading(true);
    try {
      const out = await gateway.backlog_exec_promote({ request_id: rid, redeploy: true });
      const payload = out?.payload ?? null;
      set_exec_detail(payload);
      if (payload) set_exec_selected(exec_summary_from_payload(payload, rid));
      set_exec_qa_feedback("");
      await on_done();
    } catch (e: any) {
      set_exec_qa_error(String(e?.message || e || "Failed to promote to prod"));
      // Best-effort: reload request detail so blocked promotion info (conflicts) becomes visible.
      try {
        const out = await gateway.backlog_exec_request(rid);
        const payload = out?.payload ?? null;
        set_exec_detail(payload);
        if (payload) set_exec_selected(exec_summary_from_payload(payload, rid));
      } catch {
        // ignore
      }
    } finally {
      set_exec_qa_loading(false);
    }
  }

  async function exec_deploy_uat_now(on_done: () => Promise<void>): Promise<void> {
    if (!can_use_gateway) return;
    const rid = String(exec_selected?.request_id || "").trim();
    if (!rid) return;
    if (exec_qa_loading) return;
    set_exec_qa_error("");
    set_exec_qa_loading(true);
    try {
      const out = await gateway.backlog_exec_deploy_uat({ request_id: rid });
      const payload = out?.payload ?? null;
      set_exec_detail(payload);
      if (payload) set_exec_selected(exec_summary_from_payload(payload, rid));
      await on_done();
    } catch (e: any) {
      set_exec_qa_error(String(e?.message || e || "Failed to deploy to UAT"));
    } finally {
      set_exec_qa_loading(false);
    }
  }

  async function load_exec_log_tail(load_opts?: { request_id?: string; name?: ExecLogName; max_bytes?: number }): Promise<void> {
    if (!can_use_gateway) return;
    const rid = String(load_opts?.request_id || exec_selected?.request_id || "").trim();
    if (!rid) return;
    const name = (load_opts?.name || exec_log_name) as any;
    const max_bytes = typeof load_opts?.max_bytes === "number" && Number.isFinite(load_opts.max_bytes) ? Number(load_opts.max_bytes) : 160_000;
    if (exec_log_inflight_ref.current) return;
    exec_log_inflight_ref.current = true;
    set_exec_log_error("");
    set_exec_log_loading(true);
    try {
      const follow_key = `${rid}::${String(name)}`;
      const cursor = exec_log_cursor_ref.current;
      const have_cursor = cursor !== null && cursor.key === follow_key;

      const out = await gateway.backlog_exec_log_tail({
        request_id: rid,
        name: String(name),
        max_bytes,
        ...(have_cursor ? { after_bytes: cursor.offset } : {}),
      });

      const supports_cursor = typeof out?.next_offset === "number" && Number.isFinite(out.next_offset);
      const delta = String(out?.content || "");

      if (have_cursor && supports_cursor && out?.reset !== true) {
        // Delta append; empty delta + unchanged offset = no new bytes.
        if (delta) {
          set_exec_log_text((prev) => {
            let next = prev + delta;
            if (next.length > EXEC_LOG_BUFFER_CAP) {
              // Trim from the front to a line boundary; the UI labels the
              // partial view via the truncation flag (#TRUNCATION-visible).
              const cut = next.length - EXEC_LOG_BUFFER_CAP;
              const nl = next.indexOf("\n", cut);
              next = nl >= 0 ? next.slice(nl + 1) : next.slice(cut);
              set_exec_log_truncated(true);
            }
            return next;
          });
        }
        exec_log_cursor_ref.current = { key: follow_key, offset: Number(out.next_offset) };
      } else {
        // Fresh window: first load, rotation reset, or a pre-cursor gateway
        // (#FALLBACK to whole-tail replacement — the pre-2026-07-12 shape).
        set_exec_log_text(delta);
        set_exec_log_truncated(Boolean(out?.truncated));
        exec_log_cursor_ref.current = supports_cursor ? { key: follow_key, offset: Number(out.next_offset) } : null;
      }
    } catch (e: any) {
      set_exec_log_error(String(e?.message || e || "Failed to load logs"));
    } finally {
      exec_log_inflight_ref.current = false;
      set_exec_log_loading(false);
    }
  }

  // ------------------------------------------------------- polling effects

  useEffect(() => {
    if (!can_use_gateway) return;
    if (!is_exec_view) return;
    void load_exec_config();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is_exec_view, can_use_gateway]);

  useEffect(() => {
    if (!can_use_gateway) return;
    if (!is_exec_view) return;
    const ms = kind === "processing" ? 2000 : 5000;
    // Stand down while the shared-IP gateway lock is warm (incident
    // 2026-07-15): the exec list is continuum's fastest poll (2s) and thus
    // its heaviest contribution to a warm lock — going quiet matters most
    // here of all the pollers.
    const t = setInterval(() => {
      if (gateway.is_backing_off()) return;
      void refresh_exec_list(kind, undefined, { background: true });
    }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, completed_view, can_use_gateway, is_exec_view, exec_selected?.request_id]);

  useEffect(() => {
    if (!can_use_gateway) return;
    if (!is_exec_view) return;
    if (!exec_selected?.request_id) return;
    void load_exec_log_tail({ request_id: exec_selected.request_id, name: exec_log_name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exec_selected?.request_id, exec_log_name, is_exec_view, can_use_gateway]);

  useEffect(() => {
    // When switching request or log kind, default to following the newest content.
    exec_log_follow_ref.current = true;
  }, [exec_selected?.request_id, exec_log_name]);

  useEffect(() => {
    const el = exec_log_scroll_el_ref.current;
    if (!el) return;
    if (!exec_log_follow_ref.current) return;
    const raf = window.requestAnimationFrame(() => {
      const node = exec_log_scroll_el_ref.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [exec_log_text, exec_log_name, exec_selected?.request_id]);

  useEffect(() => {
    if (!can_use_gateway) return;
    if (!is_exec_view) return;
    if (!exec_selected?.request_id) return;
    const st = String(exec_selected.status || "").trim().toLowerCase();
    // Terminal requests never grow their logs — polling them is pure waste
    // (the one-shot load on selection already fetched the tail).
    if (st === "completed" || st === "promoted" || st === "failed") return;
    // Always poll while running. Optionally poll when Auto is enabled (useful for queued → running).
    if (st !== "running" && exec_log_auto !== true) return;
    const ms = st === "running" ? 1500 : 2500;
    const t = setInterval(() => {
      if (gateway.is_backing_off()) return; // stand down during a 429 lockout
      void load_exec_log_tail({ request_id: exec_selected.request_id, name: exec_log_name });
    }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exec_selected?.request_id, exec_selected?.status, exec_log_name, is_exec_view, can_use_gateway, exec_log_auto]);

  return {
    exec_cfg,
    exec_cfg_loading,
    exec_cfg_error,
    exec_requests,
    exec_loading,
    exec_error,
    exec_selected,
    set_exec_selected,
    exec_detail,
    set_exec_detail,
    exec_detail_loading,
    exec_detail_error,
    set_exec_detail_error,
    exec_qa_feedback,
    set_exec_qa_feedback,
    exec_qa_loading,
    exec_qa_error,
    exec_log_name,
    set_exec_log_name,
    exec_log_text,
    exec_log_loading,
    exec_log_error,
    exec_log_truncated,
    exec_log_auto,
    set_exec_log_auto,
    exec_log_scroll_el_ref,
    exec_log_follow_ref,
    parsed_exec_events,
    event_stats,
    time_stats,
    clear_exec_selection,
    load_exec_config,
    refresh_exec_list,
    load_exec_request,
    exec_send_feedback,
    exec_promote_to_prod,
    exec_deploy_uat_now,
    load_exec_log_tail,
  };
}
