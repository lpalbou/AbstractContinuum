// Live logs section of an exec request: log picker (events / stderr /
// last message), auto-follow scroll, the parsed JSONL event list, and the
// raw JSONL fallback. Presentational — state comes from use_exec_pipeline.
import React from "react";

import { Markdown } from "@abstractframework/panel-chat";
import { Icon } from "@abstractframework/ui-kit";

import type { BacklogExecRequestSummary } from "../../lib/gateway_client";
import { classify_exec_event_status_kind, humanize_shell_command, infer_exec_event_main_text, infer_exec_event_time_label } from "../exec_event";
import { type ExecLogName, type ParsedExecEvents, is_near_bottom, short_id } from "./model";

export function ExecEventsView(props: {
  exec_selected: BacklogExecRequestSummary;
  exec_detail: any;
  is_compact_layout: boolean;
  exec_log_name: ExecLogName;
  set_exec_log_name: (name: ExecLogName) => void;
  exec_log_text: string;
  exec_log_loading: boolean;
  exec_log_error: string;
  exec_log_truncated: boolean;
  exec_log_auto: boolean;
  set_exec_log_auto: (updater: (v: boolean) => boolean) => void;
  exec_log_scroll_el_ref: React.MutableRefObject<HTMLDivElement | null>;
  exec_log_follow_ref: React.MutableRefObject<boolean>;
  parsed_exec_events: ParsedExecEvents | null;
  load_exec_log_tail: () => void;
}): React.ReactElement {
  const {
    exec_selected,
    exec_detail,
    is_compact_layout,
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
    load_exec_log_tail,
  } = props;

  return (
    <>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "8px" }}>
        <div className="section_title" style={{ marginTop: 0 }}>
          Live logs
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <select value={exec_log_name} onChange={(e) => set_exec_log_name(e.target.value as any)}>
            <option value="events">events</option>
            <option value="stderr">stderr</option>
            <option value="last_message">last message</option>
          </select>
          <button className={`btn ${exec_log_auto ? "primary" : ""}`} onClick={() => set_exec_log_auto((v) => !v)} disabled={!exec_selected?.request_id}>
            {exec_log_auto ? "Auto on" : "Auto off"}
          </button>
          <button
            className={`btn btn_icon ${exec_log_loading ? "is_loading" : ""}`}
            onClick={() => load_exec_log_tail()}
            disabled={exec_log_loading || !exec_selected?.request_id}
            aria-label="Refresh logs"
            title="Refresh logs"
          >
            <Icon name="refresh" size={16} />
            {is_compact_layout ? null : exec_log_loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>
      {exec_log_error ? <div className="detail_warn">{exec_log_error}</div> : null}
      {!exec_log_error && exec_log_truncated ? <div className="detail_hint">#TRUNCATION: log tail truncated</div> : null}
      {exec_log_name === "events" && parsed_exec_events ? (
        <>
          <div
            className="exec_log_scroll"
            ref={exec_log_scroll_el_ref}
            onScroll={(e) => {
              exec_log_follow_ref.current = is_near_bottom(e.currentTarget, 12);
            }}
          >
            {parsed_exec_events.events.length === 0 ? (
              <div className="empty_note">No events yet.</div>
            ) : (
              parsed_exec_events.events.map((ev) => {
                const p = ev.payload as any;
                const item = p && typeof p.item === "object" ? p.item : null;
                const item_type = item ? String(item.type || "").trim() : "";
                const item_id = item ? String(item.id || "").trim() : "";
                const thread_id = p ? String(p.thread_id || "").trim() : "";

                const status_kind = classify_exec_event_status_kind(ev.type, p);
                const badge_class = status_kind === "error" ? "danger" : status_kind === "ok" ? "ok" : "info";
                const time_label = infer_exec_event_time_label(p);
                const main_text = infer_exec_event_main_text(ev.type, p);

                const msg = String(p?.message || p?.error?.message || "").trim();
                const text = item ? String(item.text || "").trim() : "";
                const cmd = item ? String(item.command || "").trim() : "";
                const status = item ? String(item.status || "").trim() : "";
                const exit_code = item && item.exit_code != null ? String(item.exit_code) : "";
                const out = item ? String(item.aggregated_output || "").trim() : "";
                const todo_items = item && Array.isArray(item.items) ? item.items : [];

                const short_cmd = cmd ? humanize_shell_command(cmd) || cmd : "";

                return (
                  // ev.idx unconditionally: one item emits many same-type
                  // events while streaming, and colliding keys misbind the
                  // <details> open state across rows (adversarial P2).
                  <details key={`${ev.idx}-${item_id}-${ev.type}`} className={`exec_event ${status_kind}`}>
                    <summary className="exec_event_summary">
                      {time_label ? <span className="exec_event_when mono muted">{time_label}</span> : null}
                      {time_label ? <span className="exec_event_sep mono muted">|</span> : null}
                      <span className="exec_event_main mono" title={main_text}>
                        {main_text}
                      </span>
                      <span className={`chip mono ${badge_class}`}>{item_type || ev.type}</span>
                      {exit_code ? <span className="mono muted exec_event_right">exit={exit_code}</span> : null}
                    </summary>
                    <div className="exec_event_body">
                      <div className="row exec_event_meta">
                        <span className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                          {ev.type}
                        </span>
                        {item_id ? (
                          <span className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            {item_id}
                          </span>
                        ) : null}
                        {thread_id ? (
                          <span className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            thread {short_id(thread_id, 18)}
                          </span>
                        ) : null}
                      </div>

                      {msg ? (
                        <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                          {msg}
                        </pre>
                      ) : null}

                      {todo_items && todo_items.length > 0 ? (
                        <div className="mono" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                          {todo_items.map((t: any, i: number) => (
                            <div key={`${ev.idx}-todo-${i}`}>
                              {(t && t.completed) === true ? "✓" : "○"} {String(t?.text || "").trim()}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {cmd ? (
                        <div style={{ marginTop: "8px" }}>
                          <div className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            command_execution {status ? `(${status})` : ""} {exit_code ? `exit=${exit_code}` : ""}
                          </div>
                          <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
                            {short_cmd}
                          </pre>
                        </div>
                      ) : null}

                      {out ? (
                        <details style={{ marginTop: "8px" }}>
                          <summary className="mono muted" style={{ fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
                            output ({out.length.toLocaleString()} chars)
                          </summary>
                          <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                            {out}
                          </pre>
                        </details>
                      ) : null}

                      {text ? (
                        <div style={{ marginTop: "8px" }}>
                          <Markdown className="md_doc" text={text} />
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              })
            )}
          </div>
          <details style={{ marginTop: "8px" }}>
            <summary className="mono muted" style={{ fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
              Raw JSONL
              {parsed_exec_events.bad ? ` (${parsed_exec_events.bad} unparsable line(s))` : ""}
            </summary>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)", marginTop: "8px", maxHeight: "240px", overflow: "auto" }}>
              {parsed_exec_events.raw || ""}
            </pre>
          </details>
        </>
      ) : (
        <div
          className="exec_log_scroll"
          ref={exec_log_scroll_el_ref}
          onScroll={(e) => {
            exec_log_follow_ref.current = is_near_bottom(e.currentTarget, 12);
          }}
        >
          <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)" }}>
            {(() => {
              const t = String(exec_log_text || "").trim();
              if (t) return exec_log_text;
              if (exec_log_name === "last_message") {
                const last = String((exec_detail as any)?.result?.last_message || exec_selected.last_message || "").trim();
                if (last) return last;
                const st = String(exec_selected.status || "").trim().toLowerCase();
                if (st === "queued" || st === "running") {
                  return "(last message is written when the run finishes — use events for live output)";
                }
                return "(no last message yet)";
              }
              if (exec_log_name === "stderr") return "(no stderr yet)";
              return "(no logs yet)";
            })()}
          </pre>
        </div>
      )}

      {exec_detail?.result?.logs ? (
        <>
          <div className="section_divider" />
          <div className="section_title">Logs</div>
          {/* Fact grammar (2026-07-14 restyle): labels in the UI font,
              paths mono — key:value mono rows were the observer look. */}
          <div className="fact_grid">
            {exec_detail.result.logs.events_relpath ? (
              <div className="fact fact_wide">
                <span className="fact_label">events</span>
                <span className="fact_value mono">{exec_detail.result.logs.events_relpath}</span>
              </div>
            ) : null}
            {exec_detail.result.logs.stderr_relpath ? (
              <div className="fact fact_wide">
                <span className="fact_label">stderr</span>
                <span className="fact_value mono">{exec_detail.result.logs.stderr_relpath}</span>
              </div>
            ) : null}
            {exec_detail.result.logs.last_message_relpath ? (
              <div className="fact fact_wide">
                <span className="fact_label">last message</span>
                <span className="fact_value mono">{exec_detail.result.logs.last_message_relpath}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}