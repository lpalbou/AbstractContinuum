// Detail pane for one codex exec request: header + copy actions, the QA
// decision panel (awaiting_qa), promotion report, execution metadata, and
// the live logs section (ExecEventsView). Presentational — all state and
// actions come from use_exec_pipeline via props.
import React from "react";

import { Markdown, copyText } from "@abstractframework/panel-chat";
import { Icon } from "@abstractframework/ui-kit";

import type { BacklogExecRequestSummary } from "../../lib/gateway_client";
import type { ExecPipelineApi } from "./use_exec_pipeline";
import { exec_status_chip_class, format_duration_ms, short_id } from "./model";
import { ExecEventsView } from "./exec_events_view";

export function ExecDetailPane(props: {
  pipeline: ExecPipelineApi;
  is_compact_layout: boolean;
  on_back_to_list: () => void;
  /** QA actions need the page to jump tabs afterwards; the page wires them. */
  on_send_feedback: () => void;
  on_promote: () => void;
  on_deploy_uat: () => void;
}): React.ReactElement {
  const { pipeline, is_compact_layout, on_back_to_list, on_send_feedback, on_promote, on_deploy_uat } = props;
  const exec_selected = pipeline.exec_selected as BacklogExecRequestSummary | null;

  if (!exec_selected) {
    return (
      <div className="empty_note">Select an exec request.</div>
    );
  }

  const {
    exec_detail,
    exec_detail_loading,
    exec_detail_error,
    exec_qa_feedback,
    set_exec_qa_feedback,
    exec_qa_loading,
    exec_qa_error,
    event_stats,
    time_stats,
    exec_log_name,
  } = pipeline;

  return (
    <div className="inbox_detail">
      <div className="inbox_detail_header">
        <div className="inbox_detail_title">
          {/* Sans headline — the id CHIP keeps mono; a mono title at the
              largest size on the pane was the observer look (adversary). */}
          <span style={{ fontWeight: 650, fontSize: "var(--font-size-md)" }}>
            {exec_selected.backlog_filename || exec_selected.backlog_relpath || exec_selected.request_id}
          </span>
          {(() => {
            const st = String(exec_selected.status || "").trim().toLowerCase();
            return <span className={`chip mono ${exec_status_chip_class(st)}`}>{st || "unknown"}</span>;
          })()}
          <span className="chip mono muted">{short_id(exec_selected.request_id, 16)}</span>
        </div>
        <div className="inbox_detail_actions">
          {is_compact_layout ? (
            <button className="btn" onClick={on_back_to_list} disabled={exec_detail_loading}>
              Back
            </button>
          ) : null}
          <button
            className="btn btn_icon"
            onClick={() => copyText(exec_selected.request_id)}
            disabled={exec_detail_loading}
            aria-label="Copy request id"
            title="Copy request id"
          >
            <Icon name="copy" size={16} />
            {is_compact_layout ? null : "Copy request id"}
          </button>
          {exec_selected.backlog_relpath ? (
            <button
              className="btn btn_icon"
              onClick={() => copyText(exec_selected.backlog_relpath || "")}
              disabled={exec_detail_loading}
              aria-label="Copy backlog path"
              title="Copy backlog path"
            >
              <Icon name="copy" size={16} />
              {is_compact_layout ? null : "Copy backlog path"}
            </button>
          ) : null}
          {(() => {
            const items = Array.isArray(exec_detail?.backlog_queue?.items) ? (exec_detail.backlog_queue.items as any[]) : [];
            const rels = items.map((it) => String(it?.relpath || "").trim()).filter(Boolean);
            if (!rels.length) return null;
            return (
              <button
                className="btn btn_icon"
                onClick={() => copyText(rels.join("\n"))}
                disabled={exec_detail_loading}
                aria-label="Copy backlog paths"
                title="Copy backlog paths"
              >
                <Icon name="copy" size={16} />
                {is_compact_layout ? null : "Copy backlog paths"}
              </button>
            );
          })()}
          {exec_selected.run_dir_relpath ? (
            <button
              className="btn btn_icon"
              onClick={() => copyText(exec_selected.run_dir_relpath || "")}
              disabled={exec_detail_loading}
              aria-label="Copy run dir"
              title="Copy run dir"
            >
              <Icon name="copy" size={16} />
              {is_compact_layout ? null : "Copy run dir"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="detail_hint" style={{ marginTop: 0 }}>
        {exec_selected.created_at ? `created ${new Date(exec_selected.created_at).toLocaleString()}` : ""}
        {exec_selected.started_at ? ` • started ${new Date(exec_selected.started_at).toLocaleString()}` : ""}
        {exec_selected.finished_at ? ` • finished ${new Date(exec_selected.finished_at).toLocaleString()}` : ""}
      </div>

      {exec_selected.error ? (
        <div className="detail_warn">
          {exec_selected.error}
        </div>
      ) : null}
      {exec_detail_error ? (
        <div className="detail_warn">
          {exec_detail_error}
        </div>
      ) : null}

      <div style={{ marginTop: "12px" }}>
        {exec_detail_loading ? (
          <div className="empty_note">Loading…</div>
        ) : (
          <>
            <QaDecisionSection
              exec_selected={exec_selected}
              exec_detail={exec_detail}
              exec_qa_feedback={exec_qa_feedback}
              set_exec_qa_feedback={set_exec_qa_feedback}
              exec_qa_loading={exec_qa_loading}
              exec_qa_error={exec_qa_error}
              on_send_feedback={on_send_feedback}
              on_promote={on_promote}
              on_deploy_uat={on_deploy_uat}
            />
            <PromotedSection exec_selected={exec_selected} exec_detail={exec_detail} />

            <div className="section_title">Execution</div>
            {/* Fact grid: labels in the UI font, values in the UI font,
                mono reserved for the path (the key:value mono wall was
                the observer-era look — operator 2026-07-14). */}
            <div className="fact_grid">
              <div className="fact">
                <span className="fact_label">status</span>
                <span className="fact_value">{exec_selected.status || "unknown"}</span>
              </div>
              {exec_selected.executor_type ? (
                <div className="fact">
                  <span className="fact_label">executor</span>
                  <span className="fact_value">{exec_selected.executor_type}</span>
                </div>
              ) : null}
              {exec_selected.target_agent ? (
                <div className="fact">
                  <span className="fact_label">target agent</span>
                  <span className="fact_value">{exec_selected.target_agent}</span>
                </div>
              ) : null}
              {exec_selected.target_model ? (
                <div className="fact">
                  <span className="fact_label">model</span>
                  <span className="fact_value">
                    {exec_selected.target_model}
                    {exec_selected.target_reasoning_effort ? ` (reasoning ${exec_selected.target_reasoning_effort})` : ""}
                  </span>
                </div>
              ) : null}
              {exec_selected.exit_code != null ? (
                <div className="fact">
                  <span className="fact_label">exit code</span>
                  <span className="fact_value">{String(exec_selected.exit_code)}</span>
                </div>
              ) : null}
              {time_stats.age_ms != null ? (
                <div className="fact">
                  <span className="fact_label">age</span>
                  <span className="fact_value">{format_duration_ms(time_stats.age_ms)}</span>
                </div>
              ) : null}
              {time_stats.queue_delay_ms != null ? (
                <div className="fact">
                  <span className="fact_label">queue delay</span>
                  <span className="fact_value">{format_duration_ms(time_stats.queue_delay_ms)}</span>
                </div>
              ) : null}
              {time_stats.run_ms != null ? (
                <div className="fact">
                  <span className="fact_label">run time</span>
                  <span className="fact_value">{format_duration_ms(time_stats.run_ms)}</span>
                </div>
              ) : null}
              {time_stats.total_ms != null && time_stats.is_done ? (
                <div className="fact">
                  <span className="fact_label">total time</span>
                  <span className="fact_value">{format_duration_ms(time_stats.total_ms)}</span>
                </div>
              ) : null}
              {event_stats ? (
                <div className="fact">
                  <span className="fact_label">commands</span>
                  <span className="fact_value">
                    {event_stats.command_count.toLocaleString()}
                    {event_stats.command_fail_count ? ` (${event_stats.command_fail_count.toLocaleString()} failed)` : ""}
                  </span>
                </div>
              ) : null}
              <div className="fact">
                <span className="fact_label">tokens</span>
                <span className="fact_value">
                  {event_stats?.has_tokens ? (
                    <>
                      in {event_stats.input_tokens.toLocaleString()}
                      {event_stats.cached_input_tokens ? ` (cached ${event_stats.cached_input_tokens.toLocaleString()})` : ""}
                      , out {event_stats.output_tokens.toLocaleString()}, total {event_stats.total_tokens.toLocaleString()}
                    </>
                  ) : (
                    <span className="muted">{exec_log_name === "events" ? "n/a" : 'select "events"'}</span>
                  )}
                </span>
              </div>
              {exec_selected.run_dir_relpath ? (
                <div className="fact fact_wide">
                  <span className="fact_label">run dir</span>
                  <span className="fact_value mono">{exec_selected.run_dir_relpath}</span>
                </div>
              ) : null}
            </div>

            <SkillsSection exec_detail={exec_detail} />
            <PromotionSummarySection exec_detail={exec_detail} exec_qa_loading={exec_qa_loading} status={String(exec_selected.status || "")} />
            <BacklogQueueSection exec_detail={exec_detail} />
            <LastMessageSection exec_selected={exec_selected} exec_detail={exec_detail} />

            <div className="section_divider" />
            <ExecEventsView
              exec_selected={exec_selected}
              exec_detail={exec_detail}
              is_compact_layout={is_compact_layout}
              exec_log_name={pipeline.exec_log_name}
              set_exec_log_name={pipeline.set_exec_log_name}
              exec_log_text={pipeline.exec_log_text}
              exec_log_loading={pipeline.exec_log_loading}
              exec_log_error={pipeline.exec_log_error}
              exec_log_truncated={pipeline.exec_log_truncated}
              exec_log_auto={pipeline.exec_log_auto}
              set_exec_log_auto={(updater) => pipeline.set_exec_log_auto(updater as any)}
              exec_log_scroll_el_ref={pipeline.exec_log_scroll_el_ref}
              exec_log_follow_ref={pipeline.exec_log_follow_ref}
              parsed_exec_events={pipeline.parsed_exec_events}
              load_exec_log_tail={() => void pipeline.load_exec_log_tail()}
            />
          </>
        )}
      </div>
    </div>
  );
}

function QaDecisionSection(props: {
  exec_selected: BacklogExecRequestSummary;
  exec_detail: any;
  exec_qa_feedback: string;
  set_exec_qa_feedback: (v: string) => void;
  exec_qa_loading: boolean;
  exec_qa_error: string;
  on_send_feedback: () => void;
  on_promote: () => void;
  on_deploy_uat: () => void;
}): React.ReactElement | null {
  const { exec_selected, exec_detail, exec_qa_feedback, set_exec_qa_feedback, exec_qa_loading, exec_qa_error, on_send_feedback, on_promote, on_deploy_uat } =
    props;
  const st = String(exec_selected.status || "").trim().toLowerCase();
  if (st !== "awaiting_qa") return null;
  const exec_mode = String((exec_detail as any)?.execution_mode || "").trim().toLowerCase() || "uat";
  const candidate_rel = String((exec_detail as any)?.candidate_relpath || "").trim();
  const patch_rel = String((exec_detail as any)?.candidate_patch_relpath || "").trim();
  const manifest_rel = String((exec_detail as any)?.candidate_manifest_relpath || "").trim();
  const uat_rel = String((exec_detail as any)?.uat_current_relpath || "").trim();
  const uat_lock_owner = String((exec_detail as any)?.uat_lock_owner_request_id || "").trim();
  const uat_lock_acquired = Boolean((exec_detail as any)?.uat_lock_acquired);
  const uat_pending = Boolean((exec_detail as any)?.uat_pending);
  const uat_deploy = (exec_detail as any)?.uat_deploy ?? null;
  const uat_deploy_err = String((exec_detail as any)?.uat_deploy_error || "").trim();
  const attempt = (exec_detail as any)?.attempt;
  const promotion_report = (exec_detail as any)?.promotion_report ?? null;
  const promo_blocked = Boolean((promotion_report as any)?.blocked);
  const promo_reason = String((promotion_report as any)?.reason || "").trim();
  const promo_conflicts = Array.isArray((promotion_report as any)?.conflicts) ? ((promotion_report as any)?.conflicts as any[]).slice(0, 8) : [];
  const promo_conflicts_total =
    typeof (promotion_report as any)?.conflicts_total === "number" ? Number((promotion_report as any).conflicts_total) : promo_conflicts.length;

  let uat_deploy_status = "";
  let uat_deploy_reason = "";
  const uat_probe_failed: string[] = [];
  try {
    const procs = (uat_deploy as any)?.processes;
    if (procs && typeof procs === "object" && !Array.isArray(procs)) {
      if (typeof (procs as any).status === "string") uat_deploy_status = String((procs as any).status || "").trim();
      if (typeof (procs as any).reason === "string") uat_deploy_reason = String((procs as any).reason || "").trim();
      for (const [pid, stp] of Object.entries(procs as any)) {
        if (!stp || typeof stp !== "object" || Array.isArray(stp)) continue;
        const probe = (stp as any).probe;
        if (!probe || typeof probe !== "object") continue;
        if ((probe as any).ok === false) uat_probe_failed.push(String(pid));
      }
    }
  } catch {
    // ignore
  }
  return (
    <>
      <div className="section_title">QA decision</div>
      <div className="fact_grid">
        <div className="fact">
          <span className="fact_label">mode</span>
          <span className="fact_value">{exec_mode}</span>
        </div>
        {typeof attempt === "number" ? (
          <div className="fact">
            <span className="fact_label">attempt</span>
            <span className="fact_value">{attempt}</span>
          </div>
        ) : null}
        {exec_mode === "uat" && uat_lock_owner ? (
          <div className="fact">
            <span className="fact_label">uat lock</span>
            <span className="fact_value">
              {short_id(uat_lock_owner, 18)}
              {uat_lock_acquired ? " (owned)" : uat_pending ? " (pending)" : ""}
            </span>
          </div>
        ) : null}
        {candidate_rel ? (
          <div className="fact fact_wide">
            <span className="fact_label">candidate</span>
            <span className="fact_value mono">{candidate_rel}</span>
          </div>
        ) : null}
        {manifest_rel ? (
          <div className="fact fact_wide">
            <span className="fact_label">manifest</span>
            <span className="fact_value mono">{manifest_rel}</span>
          </div>
        ) : null}
        {patch_rel ? (
          <div className="fact fact_wide">
            <span className="fact_label">patch</span>
            <span className="fact_value mono">{patch_rel}</span>
          </div>
        ) : null}
        {uat_rel ? (
          <div className="fact fact_wide">
            <span className="fact_label">uat current</span>
            <span className="fact_value mono">{uat_rel}</span>
          </div>
        ) : null}
      </div>
      {exec_mode === "inplace" ? (
        <div className="detail_warn">
          Inplace mode: prod may already be mutated. Approving only finalizes the request status.
        </div>
      ) : exec_mode === "uat" && uat_pending && uat_lock_owner && !uat_lock_acquired ? (
        <div className="detail_warn">
          UAT currently points to {short_id(uat_lock_owner, 16)}. Click “Restart UAT” to switch the shared UAT stack to this request.
        </div>
      ) : exec_mode === "uat" && uat_lock_acquired ? (
        <>
          <div className="detail_hint">
            UAT URLs: gateway <code>http://localhost:6081</code>, observer <code>http://localhost:6082</code>, code <code>http://localhost:6083</code>, flow{" "}
            <code>http://localhost:6084</code>
          </div>
          <div className="detail_hint">
            UAT is intentionally short-lived: promoting or iterating will stop the shared UAT services.
          </div>
          {uat_probe_failed.length ? (
            <div className="detail_warn">
              UAT may be unreachable: URL probe failed for {uat_probe_failed.slice(0, 4).join(", ")}
              {uat_probe_failed.length > 4 ? "…" : ""}. Click “Restart UAT” and check process logs.
            </div>
          ) : null}
        </>
      ) : null}
      {exec_mode === "uat" && uat_deploy_status === "skipped" && uat_deploy_reason === "process_manager_disabled" ? (
        <div className="detail_warn">
          UAT services were not started: the process manager is off. An admin turns it on in Settings → Gateway administration (or{" "}
          <code>abstractgateway config set process_manager on</code>).
        </div>
      ) : null}
      {uat_deploy_err ? (
        <div className="detail_warn">
          UAT deploy failed: {uat_deploy_err}
        </div>
      ) : null}
      {promo_blocked && promo_reason === "conflicts" ? (
        <div className="detail_warn">
          Promotion blocked: prod diverged from the candidate base ({promo_conflicts_total} conflict
          {promo_conflicts_total === 1 ? "" : "s"}). Use “Iterate” to re-run the request on top of current prod, or resolve conflicts manually.
          {promo_conflicts.length ? (
            <ul style={{ marginTop: "8px", paddingLeft: "18px" }}>
              {promo_conflicts.map((c, idx) => (
                <li key={`c:${idx}`}>
                  {String((c as any)?.repo || "")}/{String((c as any)?.path || "")} ({String((c as any)?.reason || "conflict")})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="row" style={{ flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
        {patch_rel ? (
          <button className="btn btn_icon" onClick={() => copyText(patch_rel)} disabled={exec_qa_loading}>
            <Icon name="copy" size={16} />
            Copy patch path
          </button>
        ) : null}
        {manifest_rel ? (
          <button className="btn btn_icon" onClick={() => copyText(manifest_rel)} disabled={exec_qa_loading}>
            <Icon name="copy" size={16} />
            Copy manifest path
          </button>
        ) : null}
        {candidate_rel ? (
          <button className="btn btn_icon" onClick={() => copyText(candidate_rel)} disabled={exec_qa_loading}>
            <Icon name="copy" size={16} />
            Copy candidate path
          </button>
        ) : null}
      </div>
      <div style={{ marginTop: "10px" }}>
        <textarea
          value={exec_qa_feedback}
          onChange={(e) => set_exec_qa_feedback(e.target.value)}
          rows={3}
          placeholder="QA feedback (what to change / fix)…"
          style={{ width: "100%", resize: "vertical", minHeight: "72px" }}
          disabled={exec_qa_loading}
        />
      </div>
      {exec_qa_error ? (
        <div className="detail_warn">
          {exec_qa_error}
        </div>
      ) : null}
      <div className="row" style={{ flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
        {exec_mode === "uat" ? (
          <button className="btn" onClick={on_deploy_uat} disabled={exec_qa_loading}>
            Restart UAT
          </button>
        ) : null}
        <button className="btn primary" onClick={on_promote} disabled={exec_qa_loading}>
          {exec_mode === "inplace" ? "Approve (finalize)" : "Approve → promote to prod"}
        </button>
        <button className="btn" onClick={on_send_feedback} disabled={exec_qa_loading}>
          Iterate (send feedback)
        </button>
      </div>
      <div className="section_divider" />
    </>
  );
}

function PromotedSection(props: { exec_selected: BacklogExecRequestSummary; exec_detail: any }): React.ReactElement | null {
  const { exec_selected, exec_detail } = props;
  const st = String(exec_selected.status || "").trim().toLowerCase();
  if (st !== "promoted") return null;
  const promoted_at = String((exec_detail as any)?.promoted_at || "").trim();
  const promotion = (exec_detail as any)?.promotion ?? null;
  const promotion_report = (exec_detail as any)?.promotion_report ?? null;
  const copied = typeof (promotion as any)?.copied === "number" ? Number((promotion as any)?.copied) : null;
  const deleted = typeof (promotion as any)?.deleted === "number" ? Number((promotion as any)?.deleted) : null;
  const manifest_sha = String((promotion as any)?.manifest_sha256 || "").trim();
  const mode = String((promotion as any)?.mode || "").trim();
  const redeploy = (promotion_report as any)?.redeploy ?? null;
  const redeploy_status = String((redeploy as any)?.status || "").trim();
  const redeploy_reason = String((redeploy as any)?.reason || "").trim();
  const redeploy_error = String((promotion_report as any)?.redeploy_error || "").trim();

  return (
    <>
      <div className="section_title">Promotion</div>
      <div className="fact_grid">
        {promoted_at ? (
          <div className="fact"><span className="fact_label">promoted at</span><span className="fact_value">{new Date(promoted_at).toLocaleString()}</span></div>
        ) : null}
        {mode ? (
          <div className="fact"><span className="fact_label">mode</span><span className="fact_value">{mode}</span></div>
        ) : null}
        {manifest_sha ? (
          <div className="fact"><span className="fact_label">manifest sha256</span><span className="fact_value">{manifest_sha.slice(0, 16)}…</span></div>
        ) : null}
        {copied != null ? (
          <div className="fact"><span className="fact_label">copied</span><span className="fact_value">{copied} files</span></div>
        ) : null}
        {deleted != null ? (
          <div className="fact"><span className="fact_label">deleted</span><span className="fact_value">{deleted} files</span></div>
        ) : null}
        {redeploy_status ? (
          <div className="fact">
            <span className="fact_label">redeploy</span>
            <span className="fact_value">{redeploy_status}{redeploy_reason ? ` (${redeploy_reason})` : ""}</span>
          </div>
        ) : null}
        {redeploy_error ? (
          <div className="fact fact_wide">
            <span className="fact_label">redeploy error</span>
            <span className="fact_value" style={{ color: "var(--danger, rgb(248, 113, 113))" }}>{redeploy_error}</span>
          </div>
        ) : null}
      </div>
      <div className="section_divider" />
    </>
  );
}

function PromotionSummarySection(props: { exec_detail: any; exec_qa_loading: boolean; status: string }): React.ReactElement | null {
  const { exec_detail, exec_qa_loading } = props;
  // Promoted requests already render the dedicated PromotedSection above;
  // rendering this too duplicated the whole "Promotion" block (adversarial
  // review find, 2026-07-12). This section only covers detail payloads that
  // carry promotion data while the status has not (yet) flipped.
  if (String(props.status || "").trim().toLowerCase() === "promoted") return null;
  const promo = exec_detail && typeof (exec_detail as any).promotion === "object" ? ((exec_detail as any).promotion as any) : null;
  if (!promo) return null;
  const rep = exec_detail && typeof (exec_detail as any).promotion_report === "object" ? ((exec_detail as any).promotion_report as any) : null;
  const mode = String(promo?.mode || "").trim();
  const copied = promo?.copied != null ? String(promo.copied) : "";
  const deleted = promo?.deleted != null ? String(promo.deleted) : "";
  const sha = String(promo?.manifest_sha256 || "").trim();
  const redeploy = rep && typeof rep.redeploy === "object" ? rep.redeploy : null;
  const redeploy_status = redeploy ? String(redeploy.status || "").trim() : "";
  return (
    <>
      <div className="section_divider" />
      <div className="section_title">Promotion</div>
      <div className="fact_grid">
        {mode ? (
          <div className="fact"><span className="fact_label">mode</span><span className="fact_value">{mode}</span></div>
        ) : null}
        {copied ? (
          <div className="fact"><span className="fact_label">copied</span><span className="fact_value">{copied} files</span></div>
        ) : null}
        {deleted ? (
          <div className="fact"><span className="fact_label">deleted</span><span className="fact_value">{deleted} files</span></div>
        ) : null}
        {sha ? (
          <div className="fact fact_wide">
            <span className="fact_label">
              manifest sha256{" "}
              <button
                className="chip_icon_btn"
                onClick={() => copyText(sha)}
                disabled={exec_qa_loading}
                title="Copy the full sha"
                aria-label="Copy manifest sha256"
              >
                <Icon name="copy" size={12} />
              </button>
            </span>
            <span className="fact_value mono">{sha.slice(0, 16)}…</span>
          </div>
        ) : null}
        {redeploy_status ? (
          <div className="fact"><span className="fact_label">redeploy</span><span className="fact_value">{redeploy_status}</span></div>
        ) : null}
      </div>
    </>
  );
}

function BacklogQueueSection(props: { exec_detail: any }): React.ReactElement | null {
  const items = Array.isArray(props.exec_detail?.backlog_queue?.items) ? (props.exec_detail.backlog_queue.items as any[]) : [];
  const rels = items.map((it) => String(it?.relpath || "").trim()).filter(Boolean);
  if (!rels.length) return null;
  return (
    <>
      <div className="section_divider" />
      <div className="section_title">Backlog queue</div>
      {/* A path list, not facts — grid auto-placement would column-crush
          long relpaths (self-caught after the fact-grid conversion). */}
      <div className="path_list mono">
        {rels.map((rel) => (
          <div key={`bq:${rel}`}>{rel}</div>
        ))}
      </div>
    </>
  );
}

/** Which teachings rode this run (gateway skills-union contract c1749/c1778).
 *  Reads the payload's `skills` field: requested names, active names,
 *  resolved tree hashes, and verbatim held/blocked verdicts. Feature-
 *  detected — absent on older gateways / pre-wiring runs, renders nothing.
 *  Honest limit shown: "default-REQUESTED, never trust-bypassed" — a
 *  held/blocked default renders WITH its reason, never silently absent. */
function SkillsSection(props: { exec_detail: any }): React.ReactElement | null {
  const skills = props.exec_detail?.skills || props.exec_detail?.payload?.skills;
  if (!skills || typeof skills !== "object") return null;
  const requested: string[] = Array.isArray(skills.requested) ? skills.requested : [];
  const active: string[] = Array.isArray(skills.active) ? skills.active : [];
  const hashes: Record<string, string> = skills.resolved_tree_hashes && typeof skills.resolved_tree_hashes === "object" ? skills.resolved_tree_hashes : {};
  const verdicts: any[] = Array.isArray(skills.verdicts) ? skills.verdicts : [];
  if (!requested.length && !active.length && !verdicts.length) return null;
  const active_set = new Set(active.map((s) => String(s)));
  // Held/blocked verdicts carry a name + reason in whatever shape the
  // resolver returns; render verbatim without assuming keys beyond name.
  const held = verdicts.filter((v) => {
    const status = String(v?.status || v?.state || "").toLowerCase();
    return status && status !== "active";
  });
  return (
    <>
      <div className="section_divider" />
      <div className="section_title">Skills</div>
      {/* Chips + verdicts live OUTSIDE the fact grid: they are flow
          content, and grid auto-placement crushed the chip row into one
          150px column (self-caught after the fact-grid conversion). */}
      {skills.source ? (
        <div className="fact_grid">
          <div className="fact">
            <span className="fact_label">source</span>
            <span className="fact_value">{String(skills.source)}</span>
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
        {requested.map((name) => {
          const on = active_set.has(String(name));
          const hash = hashes[String(name)];
          return (
            <span
              key={`skill:${name}`}
              className={`chip mono ${on ? "ok" : "warn"}`}
              title={on ? (hash ? `active · ${String(hash).slice(0, 12)}` : "active") : "requested but not active — see verdict below"}
            >
              {name}
              {on ? "" : " (held)"}
            </span>
          );
        })}
      </div>
      {held.map((v, i) => {
        const name = String(v?.name || v?.skill || "skill");
        const reason = String(v?.reason || v?.detail || v?.status || "held");
        return (
          <div key={`verdict:${i}:${name}`} className="detail_warn">
            {name}: {reason}
          </div>
        );
      })}
    </>
  );
}

function LastMessageSection(props: { exec_selected: BacklogExecRequestSummary; exec_detail: any }): React.ReactElement | null {
  const last = String((props.exec_detail as any)?.result?.last_message || props.exec_selected.last_message || "").trim();
  if (!last) return null;
  return (
    <>
      <div className="section_divider" />
      <div className="section_title">Last message</div>
      {/* The agent's closing PROSE (often markdown) — rendered as prose,
          not a terminal wall (aesthetics adversary P1). Code blocks
          inside it still render mono via the markdown renderer. */}
      <div className="detail_prose">
        <Markdown className="md_doc" text={last} />
      </div>
    </>
  );
}
