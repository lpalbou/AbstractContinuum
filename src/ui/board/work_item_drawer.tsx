// Work-item drawer: the card's detail surface. Three tabs —
//   Spec:   markdown view/edit + priority/labels editor (metadata lines)
//   Runs:   this item's execution history (+ jump to live Executions)
//   Review: Definition-of-Done checklist + QA actions when awaiting QA
// Deep tooling (maintenance AI chat, attachments, advisor) stays on the
// Backlog page; the drawer links there instead of duplicating it.
import React, { useEffect, useMemo, useState } from "react";

import { Markdown, copyText } from "@abstractframework/panel-chat";

import type { BacklogExecRequestSummary, GatewayClient } from "../../lib/gateway_client";
import { exec_status_chip_class, exec_time_stats, format_duration_ms, sha256_hex, short_id } from "../backlog/model";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type WorkPriority,
  parse_labels_line,
  parse_work_item_metadata,
  write_metadata_lines,
} from "./board_model";

/** Any backlog file kind the drawer can open (archive kinds included). */
export type DrawerKind = "proposed" | "planned" | "completed" | "recurrent" | "deprecated" | "trash";

export type DrawerTarget = {
  filename: string;
  /** Known kind, or null for cards whose file location is uncertain (e.g.
   *  Done attempts — promote archives the file to completed/). The drawer
   *  resolves by trying kinds in order. */
  kind: DrawerKind | null;
  request_id?: string;
  title: string;
  /** True when a queued/running/awaiting_qa request exists for this item. */
  has_live_request?: boolean;
  /** Tab to open on (defaults to spec). */
  initial_tab?: "spec" | "runs" | "review";
  /** Ruled work id when known (dm 110): forward-compat for an Activity
   *  tab joining the hub /work index onto file cards. */
  work_id?: string;
};

type DrawerTab = "spec" | "runs" | "review";

/** Kind resolution order when the card's file location is uncertain. */
function kind_candidates(t: DrawerTarget): DrawerKind[] {
  if (t.kind) return [t.kind];
  // Terminal attempts most likely archived to completed; fall back through
  // the executable kinds.
  return ["completed", "planned", "proposed"];
}

export function WorkItemDrawer(props: {
  gateway: GatewayClient;
  can_use_gateway: boolean;
  target: DrawerTarget | null;
  on_close: () => void;
  on_mutated: () => Promise<void>;
  on_open_executions: (request_id?: string) => void;
}): React.ReactElement | null {
  const { gateway, can_use_gateway, target, on_close, on_mutated, on_open_executions } = props;
  const open = Boolean(target);

  const [tab, set_tab] = useState<DrawerTab>("spec");
  const [content, set_content] = useState("");
  const [content_sha, set_content_sha] = useState("");
  /** The kind the spec was actually found under (resolution result). */
  const [resolved_kind, set_resolved_kind] = useState<DrawerKind | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState("");

  const [editing, set_editing] = useState(false);
  const [edit_text, set_edit_text] = useState("");
  const [saving, set_saving] = useState(false);

  const [priority, set_priority] = useState<WorkPriority | "">("");
  const [labels_text, set_labels_text] = useState("");
  const [meta_saving, set_meta_saving] = useState(false);

  const [runs, set_runs] = useState<BacklogExecRequestSummary[]>([]);
  const [runs_loading, set_runs_loading] = useState(false);

  const [review_request, set_review_request] = useState<BacklogExecRequestSummary | null>(null);
  const [review_detail, set_review_detail] = useState<any>(null);
  const [qa_feedback, set_qa_feedback] = useState("");
  const [qa_loading, set_qa_loading] = useState(false);
  const [qa_error, set_qa_error] = useState("");
  // DoD ticks keyed by criterion TEXT (index keys re-attach ticks to the
  // wrong criterion after a spec edit). Session-scoped: closing the drawer
  // clears them — persistence needs a home on the exec request (gateway
  // ask filed; until then the promote label carries the unconfirmed count).
  const [dod_checked, set_dod_checked] = useState<Record<string, boolean>>({});

  const metadata = useMemo(() => parse_work_item_metadata(content), [content]);

  useEffect(() => {
    if (!open || !target) return;
    set_tab(target.initial_tab || "spec");
    set_editing(false);
    set_error("");
    set_qa_error("");
    set_qa_feedback("");
    set_dod_checked({});
    set_promote_armed(false);
    set_review_request(null);
    set_review_detail(null);
    set_resolved_kind(null);
    void load_spec(target);
    void load_runs(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.filename, target?.kind, target?.request_id]);

  async function load_spec(t: DrawerTarget): Promise<void> {
    if (!t.filename) {
      set_content("");
      set_content_sha("");
      return;
    }
    set_loading(true);
    try {
      // Kind resolution: Done attempts usually archived the file to
      // completed/ (promote ships the move), so uncertain targets try
      // kinds in order instead of erroring on the first 404.
      let found: { kind: DrawerKind; text: string } | null = null;
      let last_error: any = null;
      for (const k of kind_candidates(t)) {
        try {
          const res = await gateway.backlog_content(k as any, t.filename);
          found = { kind: k, text: String(res?.content || "") };
          break;
        } catch (e: any) {
          last_error = e;
        }
      }
      if (!found) throw last_error || new Error("Spec not found in any backlog kind");
      set_resolved_kind(found.kind);
      set_content(found.text);
      set_content_sha(await sha256_hex(found.text));
      const meta = parse_work_item_metadata(found.text);
      set_priority(meta.priority || "");
      set_labels_text(meta.labels.join(", "));
    } catch (e: any) {
      set_error(String(e?.message || e || "Failed to load the spec"));
    } finally {
      set_loading(false);
    }
  }

  async function load_runs(t: DrawerTarget): Promise<void> {
    set_runs_loading(true);
    try {
      // Status-scoped fetches so live requests can never fall out of a
      // window churned by terminal history; terminal history is bounded
      // recent (the gateway filters by status BEFORE the limit).
      const [active_res, terminal_res] = await Promise.all([
        gateway.backlog_exec_requests({ status: "queued,running,awaiting_qa", limit: 200 }),
        gateway.backlog_exec_requests({ status: "promoted,completed,failed", limit: 200 }),
      ]);
      const all = [
        ...(Array.isArray(active_res?.requests) ? active_res.requests : []),
        ...(Array.isArray(terminal_res?.requests) ? terminal_res.requests : []),
      ];
      // Batch targets carry no filename: match by request_id ONLY (an
      // empty-filename equality would adopt every filename-less request).
      const list = all.filter((r) =>
        t.filename ? String(r.backlog_filename || "").trim() === t.filename || r.request_id === t.request_id : r.request_id === t.request_id
      );
      list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      set_runs(list);
      const reviewable = list.find((r) => String(r.status || "").toLowerCase() === "awaiting_qa") || null;
      set_review_request(reviewable);
      if (reviewable) {
        try {
          const detail = await gateway.backlog_exec_request(reviewable.request_id);
          set_review_detail(detail?.payload ?? null);
        } catch {
          set_review_detail(null);
        }
      }
    } catch {
      set_runs([]);
    } finally {
      set_runs_loading(false);
    }
  }

  async function save_edit(): Promise<void> {
    if (!target || saving) return;
    const kind = resolved_kind || target.kind;
    if (!kind) return;
    set_saving(true);
    set_error("");
    try {
      const updated = await gateway.backlog_update({ kind, filename: target.filename, content: edit_text, expected_sha256: content_sha || null });
      const next = edit_text.endsWith("\n") ? edit_text : `${edit_text}\n`;
      set_content(next);
      set_content_sha(String(updated?.sha256 || ""));
      set_editing(false);
      await on_mutated();
    } catch (e: any) {
      set_error(String(e?.message || e || "Save failed"));
    } finally {
      set_saving(false);
    }
  }

  async function save_metadata(): Promise<void> {
    if (!target || meta_saving) return;
    const kind = resolved_kind || target.kind;
    if (!kind) return;
    set_meta_saving(true);
    set_error("");
    try {
      const next_text = write_metadata_lines(content, {
        priority: (priority || null) as WorkPriority | null,
        labels: parse_labels_line(labels_text),
      });
      const updated = await gateway.backlog_update({ kind, filename: target.filename, content: next_text, expected_sha256: content_sha || null });
      set_content(next_text.endsWith("\n") ? next_text : `${next_text}\n`);
      set_content_sha(String(updated?.sha256 || ""));
      await on_mutated();
    } catch (e: any) {
      set_error(String(e?.message || e || "Metadata save failed"));
    } finally {
      set_meta_saving(false);
    }
  }

  const [promote_armed, set_promote_armed] = useState(false);

  async function qa_action(kind: "feedback" | "promote" | "deploy_uat"): Promise<void> {
    if (!review_request || qa_loading) return;
    if (kind === "feedback" && !qa_feedback.trim()) {
      set_qa_error("Feedback is required.");
      return;
    }
    set_qa_loading(true);
    set_qa_error("");
    try {
      if (kind === "feedback") await gateway.backlog_exec_feedback({ request_id: review_request.request_id, feedback: qa_feedback });
      else if (kind === "promote") await gateway.backlog_exec_promote({ request_id: review_request.request_id, redeploy: true });
      else await gateway.backlog_exec_deploy_uat({ request_id: review_request.request_id });
      set_qa_feedback("");
      set_promote_armed(false);
      if (target) await load_runs(target);
      await on_mutated();
    } catch (e: any) {
      set_qa_error(String(e?.message || e || "QA action failed"));
      // Reload the detail so blocked promotions (conflicts) become visible
      // — parity with the pipeline's promote error path.
      try {
        const out = await gateway.backlog_exec_request(review_request.request_id);
        set_review_detail(out?.payload ?? null);
      } catch {
        // ignore
      }
    } finally {
      set_qa_loading(false);
    }
  }

  if (!open || !target) return null;

  const unconfirmed = metadata.acceptance.filter((a, idx) => !dod_checked[`${idx}:${a.text}`]).length;

  return (
    <div
      className="drawer_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) on_close();
      }}
    >
      <div className="drawer_panel work_drawer">
        <div className="drawer_header">
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <div className="drawer_title" title={target.filename}>
              {target.title}
            </div>
            <div className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
              {resolved_kind || target.kind || "locating…"}
              {target.filename ? ` • ${target.filename}` : ""}
            </div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            {target.filename ? (
              <button
                className="btn"
                onClick={() => copyText(`docs/backlog/${resolved_kind || target.kind || "planned"}/${target.filename}`)}
                title="Copy repo path"
              >
                Copy path
              </button>
            ) : null}
            <button className="btn" onClick={on_close}>
              Close
            </button>
          </div>
        </div>

        <div className="tab_bar work_drawer_tabs">
          <button className={`tab ${tab === "spec" ? "active" : ""}`} onClick={() => set_tab("spec")}>
            Spec
          </button>
          <button className={`tab ${tab === "runs" ? "active" : ""}`} onClick={() => set_tab("runs")}>
            Runs {runs.length ? `(${runs.length})` : ""}
          </button>
          <button className={`tab ${tab === "review" ? "active" : ""}`} onClick={() => set_tab("review")}>
            Review{review_request ? " ●" : ""}
          </button>
        </div>

        <div className="drawer_body work_drawer_body">
          {error ? <div className="mono board_error">{error}</div> : null}

          {tab === "spec" ? (
            <>
              {target.has_live_request ? (
                <div className="mono" style={{ color: "rgb(250, 204, 21)", fontSize: "var(--font-size-sm)", marginBottom: "8px" }}>
                  An execution holds a queue-time snapshot of this spec — edits here will NOT reach the running agent; they apply to the next
                  run (and QA iterations re-run from the snapshot plus your feedback).
                </div>
              ) : null}
              {target.filename ? (
                <div className="work_meta_editor">
                  <select value={priority} onChange={(e) => set_priority(e.target.value as any)} disabled={meta_saving} title="Priority">
                    <option value="">priority: unset</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={labels_text}
                    onChange={(e) => set_labels_text(e.target.value)}
                    placeholder="labels (comma-separated; sprints: sprint-29)"
                    disabled={meta_saving}
                  />
                  <button className="btn" onClick={() => void save_metadata()} disabled={meta_saving || !can_use_gateway || loading}>
                    {meta_saving ? "Saving…" : "Save metadata"}
                  </button>
                  {!editing ? (
                    <button
                      className="btn"
                      onClick={() => {
                        set_edit_text(content);
                        set_editing(true);
                      }}
                      disabled={loading}
                    >
                      Edit spec
                    </button>
                  ) : (
                    <>
                      <button className="btn" onClick={() => set_editing(false)} disabled={saving}>
                        Cancel
                      </button>
                      <button className="btn primary" onClick={() => void save_edit()} disabled={saving}>
                        {saving ? "Saving…" : "Save spec"}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              {loading ? (
                <div className="mono muted">Loading…</div>
              ) : editing ? (
                <textarea className="mono work_spec_editor" value={edit_text} onChange={(e) => set_edit_text(e.target.value)} rows={24} />
              ) : content ? (
                <>
                  <Markdown className="md_doc" text={content} />
                  <div className="mono muted" style={{ fontSize: "var(--font-size-xs)", marginTop: "10px" }}>
                    Deep tooling (maintenance AI chat, attachments, advisor) lives on the Backlog page.
                  </div>
                </>
              ) : (
                <div className="mono muted">No spec file for this card (batch execution). See Runs.</div>
              )}
            </>
          ) : null}

          {tab === "runs" ? (
            <>
              {runs_loading ? <div className="mono muted">Loading…</div> : null}
              {!runs_loading && !runs.length ? <div className="mono muted">No executions for this item in recent history (window: live + last 200 finished).</div> : null}
              {runs.map((r) => {
                const st = String(r.status || "").toLowerCase();
                const stats = exec_time_stats(r);
                return (
                  <div key={r.request_id} className="work_run_row">
                    <span className={`chip mono ${exec_status_chip_class(st)}`}>{st}</span>
                    <span className="mono muted">{short_id(r.request_id, 18)}</span>
                    <span className="mono muted">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span>
                    <span className="mono muted">{stats.run_ms != null ? `ran ${format_duration_ms(stats.run_ms)}` : ""}</span>
                    {r.target_agent ? <span className="chip mono muted">{r.target_agent}</span> : null}
                    {st === "running" || st === "queued" || st === "awaiting_qa" ? (
                      <button className="btn" onClick={() => on_open_executions(r.request_id)}>
                        {st === "awaiting_qa" ? "View logs" : "Follow live"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : null}

          {tab === "review" ? (
            !review_request ? (
              <div className="mono muted">Nothing awaiting review for this item.</div>
            ) : (
              <>
                <div className="section_title" style={{ marginTop: 0 }}>
                  Definition of Done — acceptance criteria
                </div>
                <div className="mono muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: "6px" }}>
                  Criteria come from the current spec file; if the agent refined them inside the candidate, review against the candidate patch too.
                  Ticks live in this drawer session only.
                </div>
                {metadata.acceptance.length ? (
                  <div className="work_dod_list">
                    {metadata.acceptance.map((a, idx) => (
                      // Index-scoped key + tick key: duplicate criterion
                      // texts must not share one checkbox (adversarial P2).
                      <label key={`dod:${idx}:${a.text}`} className="work_dod_item">
                        <input
                          type="checkbox"
                          checked={Boolean(dod_checked[`${idx}:${a.text}`])}
                          onChange={(e) => set_dod_checked((prev) => ({ ...prev, [`${idx}:${a.text}`]: e.target.checked }))}
                        />
                        <span>{a.text}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mono muted">This spec declares no acceptance criteria — review against the diff and logs.</div>
                )}

                {(() => {
                  const mode = String(review_detail?.execution_mode || "uat").toLowerCase();
                  const candidate = String(review_detail?.candidate_relpath || "").trim();
                  const promo_report = review_detail?.promotion_report;
                  const blocked = Boolean(promo_report?.blocked);
                  return (
                    <>
                      <div className="row" style={{ alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                        <span className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
                          mode: {mode}
                          {candidate ? ` • candidate: ${candidate}` : ""}
                        </span>
                        <button className="btn" onClick={() => on_open_executions(review_request.request_id)} title="Open this run's logs and events in Executions">
                          View run logs
                        </button>
                      </div>
                      {blocked ? (
                        <div className="mono board_error" style={{ marginTop: "6px" }}>
                          Promotion blocked: {String(promo_report?.reason || "conflicts")} — iterate on top of current prod or resolve manually.
                        </div>
                      ) : null}
                    </>
                  );
                })()}

                {metadata.acceptance.length && unconfirmed > 0 ? (
                  <div className="mono" style={{ color: "rgb(250, 204, 21)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                    {unconfirmed} acceptance criteri{unconfirmed === 1 ? "on" : "a"} unconfirmed — promoting anyway is an override.
                  </div>
                ) : null}

                <textarea
                  value={qa_feedback}
                  onChange={(e) => set_qa_feedback(e.target.value)}
                  rows={3}
                  placeholder="QA feedback (what to change / fix)…"
                  style={{ width: "100%", marginTop: "10px" }}
                  disabled={qa_loading}
                />
                {qa_error ? <div className="mono board_error">{qa_error}</div> : null}
                <div className="row" style={{ gap: 8, marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn" onClick={() => void qa_action("deploy_uat")} disabled={qa_loading}>
                    Restart UAT
                  </button>
                  {!promote_armed ? (
                    <button className="btn primary" onClick={() => set_promote_armed(true)} disabled={qa_loading}>
                      {metadata.acceptance.length && unconfirmed > 0 ? "Promote (override)…" : "Approve → promote…"}
                    </button>
                  ) : (
                    // Two-step confirm: promote writes PROD and redeploys —
                    // the heaviest action gets the heaviest gate.
                    <>
                      <button className="btn danger" onClick={() => void qa_action("promote")} disabled={qa_loading}>
                        Confirm: promote to prod{unconfirmed > 0 ? ` (${unconfirmed} unconfirmed)` : ""} + redeploy
                      </button>
                      <button className="btn" onClick={() => set_promote_armed(false)} disabled={qa_loading}>
                        Cancel
                      </button>
                    </>
                  )}
                  <button className="btn" onClick={() => void qa_action("feedback")} disabled={qa_loading}>
                    Iterate (send feedback)
                  </button>
                </div>
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
