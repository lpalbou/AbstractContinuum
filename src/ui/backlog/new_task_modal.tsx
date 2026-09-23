// New-backlog-task modal: kind/type/package/title/summary fields, guided
// draft fields, attachments, a template-prefilled markdown draft, and the
// AI Assist chat. Owns all of its state (reset on close, exactly like the
// pre-split page-level reset_new_task) — the page passes an on_created
// callback to jump to the created item.
import React, { useEffect, useState } from "react";

import { ChatComposer, ChatThread, type ChatMessage } from "@abstractframework/panel-chat";

import type { GatewayClient } from "../../lib/gateway_client";
import { random_id } from "../../lib/ids";
import { Modal } from "../modal";
import { PRIORITIES, PRIORITY_LABELS, type WorkPriority, parse_labels_line, write_metadata_lines } from "../board/board_model";
import {
  type BacklogFileKind,
  type BacklogTaskType,
  WORK_ITEM_TYPES,
  format_created_at,
  generate_backlog_draft_from_guided,
  insert_attachment_links,
  lines_list,
  render_backlog_template_draft,
  sha256_hex,
} from "./model";

export function NewTaskModal(props: {
  open: boolean;
  gateway: GatewayClient;
  can_use_gateway: boolean;
  maint_provider: string;
  maint_model: string;
  /** Reasoning effort on the `thinking` wire key ("" = gateway default). */
  maint_reasoning?: string;
  on_close: () => void;
  on_created: (created_kind: BacklogFileKind, filename: string, attachment_warning: string) => Promise<void>;
}): React.ReactElement {
  const { open, gateway, can_use_gateway, maint_provider, maint_model, maint_reasoning, on_close, on_created } = props;

  const [backlog_template_md, set_backlog_template_md] = useState("");
  const [template_loading, set_template_loading] = useState(false);
  const [template_error, set_template_error] = useState("");

  const [new_kind, set_new_kind] = useState<"planned" | "proposed" | "recurrent">("proposed");
  const [new_task_type, set_new_task_type] = useState<BacklogTaskType>("feature");
  const [new_package, set_new_package] = useState("framework");
  const [new_title, set_new_title] = useState("");
  const [new_summary, set_new_summary] = useState("");
  const [new_priority, set_new_priority] = useState<WorkPriority | "">("");
  const [new_labels, set_new_labels] = useState("");
  const [new_draft, set_new_draft] = useState("");
  const [new_error, set_new_error] = useState("");
  const [new_loading, set_new_loading] = useState(false);

  const [guided_diagram, set_guided_diagram] = useState("");
  const [guided_context, set_guided_context] = useState("");
  const [guided_included, set_guided_included] = useState("");
  const [guided_excluded, set_guided_excluded] = useState("");
  const [guided_plan, set_guided_plan] = useState("");
  const [guided_dependencies, set_guided_dependencies] = useState("");
  const [guided_acceptance, set_guided_acceptance] = useState("");
  const [guided_tests_a, set_guided_tests_a] = useState("");
  const [guided_tests_b, set_guided_tests_b] = useState("");
  const [guided_tests_c, set_guided_tests_c] = useState("");

  const [new_attachments, set_new_attachments] = useState<File[]>([]);
  const [attachments_uploading, set_attachments_uploading] = useState(false);
  const [attachments_error, set_attachments_error] = useState("");

  const [assist_messages, set_assist_messages] = useState<ChatMessage[]>([]);
  const [assist_input, set_assist_input] = useState("");
  const [assist_loading, set_assist_loading] = useState(false);

  function reset_new_task(): void {
    set_new_kind("proposed");
    set_new_task_type("feature");
    set_new_package("framework");
    set_new_title("");
    set_new_summary("");
    set_new_priority("");
    set_new_labels("");
    set_new_draft("");
    set_new_error("");
    set_new_loading(false);
    set_guided_diagram("");
    set_guided_context("");
    set_guided_included("");
    set_guided_excluded("");
    set_guided_plan("");
    set_guided_dependencies("");
    set_guided_acceptance("");
    set_guided_tests_a("");
    set_guided_tests_b("");
    set_guided_tests_c("");
    set_new_attachments([]);
    set_attachments_uploading(false);
    set_attachments_error("");
    set_assist_messages([]);
    set_assist_input("");
    set_assist_loading(false);
  }

  function close(): void {
    on_close();
    reset_new_task();
  }

  async function ensure_backlog_template(): Promise<string> {
    const existing = String(backlog_template_md || "").trim();
    if (existing) return existing;
    if (template_loading) return "";
    set_template_error("");
    set_template_loading(true);
    try {
      const out = await gateway.backlog_template();
      const text = String(out?.content || "");
      set_backlog_template_md(text);
      return text;
    } catch (e: any) {
      set_template_error(String(e?.message || e || "Failed to load backlog template"));
      return "";
    } finally {
      set_template_loading(false);
    }
  }

  async function apply_template_to_draft(opts?: { force?: boolean }): Promise<void> {
    if (!can_use_gateway) return;
    const force = opts?.force === true;
    if (!force && new_draft.trim()) return;
    const template_md = await ensure_backlog_template();
    if (!template_md.trim()) return;
    const pkg = String(new_package || "").trim().toLowerCase() || "{Package}";
    const created_at = format_created_at();
    const rendered = render_backlog_template_draft(template_md, {
      package_name: pkg,
      title: new_title,
      task_type: new_task_type,
      summary: new_summary,
      created_at,
    });
    set_new_draft((prev) => (force || !String(prev || "").trim() ? rendered : prev));
  }

  useEffect(() => {
    if (!open) return;
    if (!can_use_gateway) return;
    void apply_template_to_draft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, can_use_gateway]);

  function regenerate_draft_from_guided(opts?: { force?: boolean }): void {
    const force = opts?.force === true;
    if (!force && new_draft.trim()) {
      const ok = globalThis.confirm("Overwrite the current draft markdown with a guided draft?");
      if (!ok) return;
    }
    const pkg = String(new_package || "").trim().toLowerCase() || "{Package}";
    const created_at = format_created_at();
    const draft = generate_backlog_draft_from_guided({
      package_name: pkg,
      title: new_title,
      task_type: new_task_type,
      summary: new_summary,
      diagram: guided_diagram,
      context: guided_context,
      included: lines_list(guided_included),
      excluded: lines_list(guided_excluded),
      plan: lines_list(guided_plan),
      dependencies: lines_list(guided_dependencies),
      acceptance: lines_list(guided_acceptance),
      tests_a: lines_list(guided_tests_a),
      tests_b: lines_list(guided_tests_b),
      tests_c: lines_list(guided_tests_c),
      created_at,
      attachments: [],
    });
    set_new_draft(draft);
  }

  async function submit_new_task(): Promise<void> {
    if (new_loading) return;
    set_new_error("");
    set_new_loading(true);
    set_attachments_error("");
    let attachment_warning = "";
    try {
      const pkg = String(new_package || "")
        .trim()
        .toLowerCase();
      // Stamp the priority/labels metadata lines into the draft (the board
      // convention; parsed back by board_model.parse_work_item_metadata).
      const labels = parse_labels_line(new_labels);
      const has_meta = Boolean(new_priority || labels.length);
      let draft = new_draft || "";
      if (has_meta && draft.trim()) {
        draft = write_metadata_lines(draft, { priority: (new_priority || null) as WorkPriority | null, labels });
      }
      const out = await gateway.backlog_create({
        kind: new_kind,
        package: pkg,
        title: new_title,
        task_type: new_task_type,
        summary: new_summary || null,
        content: draft || null,
      });
      const created_kind = String(out?.kind || "").trim() as BacklogFileKind;
      const filename = String(out?.filename || "").trim();

      // Draft empty (template fetch failed / user cleared it) but metadata
      // chosen: the gateway generated the content server-side, so stamp
      // the lines with a follow-up update — chosen priority/labels must
      // never silently vanish (adversarial find).
      if (has_meta && !draft.trim() && created_kind && filename) {
        try {
          const current = await gateway.backlog_content(created_kind as any, filename);
          const cur_text = String(current?.content || "");
          const cur_sha = await sha256_hex(cur_text);
          const next_text = write_metadata_lines(cur_text, { priority: (new_priority || null) as WorkPriority | null, labels });
          await gateway.backlog_update({ kind: created_kind, filename, content: next_text, expected_sha256: cur_sha || null });
        } catch (e: any) {
          attachment_warning = [attachment_warning, `metadata lines not written: ${String(e?.message || e)}`].filter(Boolean).join("; ");
        }
      }

      const attachments = [...(new_attachments || [])];
      if (created_kind && filename && attachments.length) {
        set_attachments_uploading(true);
        const uploaded: string[] = [];
        try {
          for (const f of attachments) {
            const res = await gateway.backlog_upload_attachment({ kind: created_kind, filename, file: f, overwrite: false });
            const relpath = String(res?.stored?.relpath || "").trim();
            if (relpath) uploaded.push(relpath);
          }
        } catch (e: any) {
          attachment_warning = [attachment_warning, String(e?.message || e || "Attachment upload failed")].filter(Boolean).join("; ");
          set_attachments_error(attachment_warning);
        } finally {
          // Link whatever DID upload even when a later one failed —
          // partial uploads must not be orphaned (adversarial find).
          if (uploaded.length) {
            try {
              const current = await gateway.backlog_content(created_kind as any, filename);
              const cur_text = String(current?.content || "");
              const cur_sha = await sha256_hex(cur_text);
              const next_text = insert_attachment_links(cur_text, uploaded);
              await gateway.backlog_update({ kind: created_kind, filename, content: next_text, expected_sha256: cur_sha || null });
            } catch (e: any) {
              attachment_warning = [attachment_warning, `uploaded files not linked: ${String(e?.message || e)}`].filter(Boolean).join("; ");
            }
          }
          set_attachments_uploading(false);
        }
      }

      on_close();
      reset_new_task();
      // Outside the try: the task IS created at this point — a transient
      // failure in the parent's refresh callback must not write an error
      // into the now-closed modal, where it silently haunts the next open
      // (adversarial P2 2026-07-13). The parent surfaces its own errors.
      try {
        await on_created(created_kind, filename, attachment_warning);
      } catch {
        // parent refresh failed; its own error surfaces handle it
      }
    } catch (e: any) {
      set_new_error(String(e?.message || e || "Create failed"));
    } finally {
      set_new_loading(false);
    }
  }

  async function send_assist(): Promise<void> {
    if (assist_loading) return;
    set_new_error("");
    const msg = assist_input.trim();
    if (!msg) return;
    if (!new_title.trim()) {
      set_new_error("Title is required before using AI assist.");
      return;
    }
    const pkg = String(new_package || "")
      .trim()
      .toLowerCase();
    if (!pkg) {
      set_new_error("Package is required before using AI assist.");
      return;
    }
    const user_msg: ChatMessage = { id: random_id(), role: "user", content: msg, ts: new Date().toISOString() };
    const next_msgs = [...assist_messages, user_msg];
    set_assist_messages(next_msgs);
    set_assist_input("");
    set_assist_loading(true);
    try {
      const out = await gateway.backlog_assist({
        kind: new_kind,
        package: pkg,
        title: new_title,
        summary: new_summary || null,
        draft_markdown: new_draft || null,
        messages: next_msgs.map((m) => ({ role: m.role, content: m.content })),
        provider: maint_provider || null,
        model: maint_model || null,
        thinking: maint_reasoning || null,
      });
      const reply = String(out?.reply || "").trim();
      const draft = String(out?.draft_markdown || "").trim();
      if (reply) set_assist_messages((ms) => [...ms, { id: random_id(), role: "assistant", content: reply, ts: new Date().toISOString() }]);
      if (draft) set_new_draft(draft);
    } catch (e: any) {
      set_new_error(String(e?.message || e || "AI assist failed"));
    } finally {
      set_assist_loading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="New backlog task"
      onClose={close}
      actions={
        <>
          <button className="btn" onClick={close} disabled={new_loading || assist_loading}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit_new_task()} disabled={new_loading || !new_title.trim() || !new_package.trim()}>
            {new_loading ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <div className="row">
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Kind (proposed → board Triage · planned → board Ready · recurrent → Backlog page)</label>
            <select value={new_kind} onChange={(e) => set_new_kind(e.target.value as any)}>
              <option value="proposed">proposed</option>
              <option value="planned">planned</option>
              <option value="recurrent">recurrent</option>
            </select>
          </div>
        </div>
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Type</label>
            <select value={new_task_type} onChange={(e) => set_new_task_type(e.target.value as any)}>
              {WORK_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Package</label>
            <input value={new_package} onChange={(e) => set_new_package(e.target.value)} placeholder="framework" />
          </div>
        </div>
      </div>

      <div className="field">
        <label>Title</label>
        <input value={new_title} onChange={(e) => set_new_title(e.target.value)} placeholder="Short descriptive title" />
      </div>
      <div className="row">
        <div className="col" style={{ minWidth: 220 }}>
          <div className="field">
            <label>Priority</label>
            <select value={new_priority} onChange={(e) => set_new_priority(e.target.value as any)}>
              <option value="">unset</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="col" style={{ minWidth: 320 }}>
          <div className="field">
            <label>Labels (comma-separated; sprints: sprint-29)</label>
            <input value={new_labels} onChange={(e) => set_new_labels(e.target.value)} placeholder="ui, security, sprint-29" className="mono" />
          </div>
        </div>
      </div>
      <div className="field">
        <label>Summary (optional)</label>
        <textarea value={new_summary} onChange={(e) => set_new_summary(e.target.value)} rows={3} placeholder="One paragraph summary" />
      </div>

      <div className="section_divider" />
      <div className="section_title">Guided fields (optional)</div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
        Use this to generate a structured draft without editing markdown directly. One item per line for list fields.
      </div>
      <div style={{ marginTop: "8px" }}>
        <details>
          <summary className="mono" style={{ cursor: "pointer" }}>
            Show guided fields
          </summary>
          <div className="field" style={{ marginTop: "10px" }}>
            <label>Diagram (ASCII)</label>
            <textarea value={guided_diagram} onChange={(e) => set_guided_diagram(e.target.value)} rows={4} className="mono" placeholder="(optional) ascii diagram" />
          </div>
          <div className="field">
            <label>Context</label>
            <textarea
              value={guided_context}
              onChange={(e) => set_guided_context(e.target.value)}
              rows={4}
              placeholder="Why is this needed? Link to evidence (reports, discussions, etc.)."
            />
          </div>
          <div className="row">
            <div className="col" style={{ minWidth: 260 }}>
              <div className="field">
                <label>Scope: Included (1 per line)</label>
                <textarea value={guided_included} onChange={(e) => set_guided_included(e.target.value)} rows={4} className="mono" placeholder="..." />
              </div>
            </div>
            <div className="col" style={{ minWidth: 260 }}>
              <div className="field">
                <label>Scope: Excluded (1 per line)</label>
                <textarea value={guided_excluded} onChange={(e) => set_guided_excluded(e.target.value)} rows={4} className="mono" placeholder="..." />
              </div>
            </div>
          </div>
          <div className="field">
            <label>Implementation Plan (1 per line)</label>
            <textarea value={guided_plan} onChange={(e) => set_guided_plan(e.target.value)} rows={4} className="mono" placeholder="..." />
          </div>
          <div className="field">
            <label>Dependencies (1 per line)</label>
            <textarea
              value={guided_dependencies}
              onChange={(e) => set_guided_dependencies(e.target.value)}
              rows={3}
              className="mono"
              placeholder="Related backlog items / ADRs / external libs…"
            />
          </div>
          <div className="field">
            <label>Acceptance Criteria (1 per line)</label>
            <textarea value={guided_acceptance} onChange={(e) => set_guided_acceptance(e.target.value)} rows={4} className="mono" placeholder="..." />
          </div>
          <div className="row">
            <div className="col" style={{ minWidth: 260 }}>
              <div className="field">
                <label>Testing Level A (1 per line)</label>
                <textarea value={guided_tests_a} onChange={(e) => set_guided_tests_a(e.target.value)} rows={3} className="mono" placeholder="cd pkg && pytest -q ..." />
              </div>
            </div>
            <div className="col" style={{ minWidth: 260 }}>
              <div className="field">
                <label>Testing Level B (1 per line)</label>
                <textarea
                  value={guided_tests_b}
                  onChange={(e) => set_guided_tests_b(e.target.value)}
                  rows={3}
                  className="mono"
                  placeholder="run local gateway + manual verification..."
                />
              </div>
            </div>
          </div>
          <div className="field">
            <label>Testing Level C (1 per line)</label>
            <textarea value={guided_tests_c} onChange={(e) => set_guided_tests_c(e.target.value)} rows={2} className="mono" placeholder="(optional / opt-in)" />
          </div>
          <div className="row" style={{ marginTop: "10px", justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => regenerate_draft_from_guided()} disabled={new_loading || assist_loading}>
              Generate draft from guided fields
            </button>
          </div>
        </details>
      </div>

      <div className="section_divider" />
      <div className="section_title">Attachments (optional)</div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
        Upload screenshots/diagrams to `docs/backlog/assets/&lt;id&gt;/` and link them under `## Related` after the task is created.
      </div>
      <div className="field" style={{ marginTop: "8px" }}>
        <input
          type="file"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            set_new_attachments((prev) => [...prev, ...files]);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {new_attachments.length ? (
        <div className="mono" style={{ fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
          {new_attachments.map((f, idx) => (
            <div key={`${f.name}_${f.size}_${idx}`} className="row" style={{ alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
              <span className="mono muted" style={{ paddingRight: "10px" }}>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </span>
              <button
                className="btn"
                onClick={() => set_new_attachments((prev) => prev.filter((_, i) => i !== idx))}
                disabled={new_loading || attachments_uploading}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachments_uploading ? (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          Uploading attachments…
        </div>
      ) : null}
      {attachments_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          {attachments_error}
        </div>
      ) : null}

      <div className="section_divider" />
      <div className="section_title">Draft (Markdown)</div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
        Prefilled from `docs/backlog/template.md` (editable). AI assist can also refine the draft.
      </div>
      {template_loading ? (
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          Loading template…
        </div>
      ) : null}
      {template_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          {template_error}
        </div>
      ) : null}
      <div className="row" style={{ marginTop: "10px", justifyContent: "flex-end", gap: "8px" }}>
        <button
          className="btn"
          onClick={() => {
            if (new_draft.trim()) {
              const ok = globalThis.confirm("Reset the draft markdown to the backlog template?");
              if (!ok) return;
            }
            void apply_template_to_draft({ force: true });
          }}
          disabled={new_loading || assist_loading || template_loading || !can_use_gateway}
        >
          Reset from template
        </button>
      </div>
      <div className="field">
        <textarea value={new_draft} onChange={(e) => set_new_draft(e.target.value)} rows={10} className="mono" placeholder="(optional) full markdown draft" />
      </div>

      <div className="section_divider" />
      <div className="section_title">AI Assist (chat)</div>
      <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
        Use this to iteratively refine a backlog draft; assistant replies can also update the draft markdown.
      </div>

      <ChatThread
        messages={assist_messages}
        className="backlog_chat_thread_small"
        empty={
          <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
            No messages yet.
          </div>
        }
      />

      <div style={{ marginTop: "10px" }}>
        <ChatComposer
          value={assist_input}
          onChange={set_assist_input}
          onSubmit={() => void send_assist()}
          placeholder="Message to AI (e.g. refine acceptance criteria…)"
          disabled={!can_use_gateway || !new_title.trim()}
          busy={assist_loading}
          rows={3}
          sendButtonClassName="btn primary"
        />
      </div>

      {new_error ? (
        <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
          {new_error}
        </div>
      ) : null}
    </Modal>
  );
}
