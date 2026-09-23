// Pure model helpers for the backlog + codex exec pipeline pages.
// No React, no network: everything here is unit-testable, and the pin tests
// in model.test.ts guard the behavior the UI modules rely on.
//
// Extracted verbatim from the pre-split backlog_browser.tsx (2026-07-12).

import type { BacklogExecRequestSummary, BacklogItemSummary } from "../../lib/gateway_client";

export type BacklogTab = "processing" | "planned" | "proposed" | "recurrent" | "completed" | "failed" | "deprecated" | "trash";
export type BacklogFileKind = "planned" | "proposed" | "recurrent" | "completed" | "deprecated" | "trash";

/**
 * Ruled work-item type vocabulary (semantics seat, commons c1123; the
 * canonical copy is `decision:workitem-type-enum` in the hub decision
 * store — this constant CITES it, per the one-copy rule). Two sets:
 * - OFFER (write/UI): exactly these four — pickers offer nothing else.
 * - ACCEPT (read): OPEN — unknown at-rest values render as-written,
 *   labeled unknown, never coerced, never rejected (engraved files).
 * Definitions pivot on BEHAVIOR: bug = behavior wrong; feature = new
 * capability; improvement = existing behavior made better; task = no
 * behavioral change (refactors/docs/tests/CI/deps/ops).
 */
export const WORK_ITEM_TYPES = ["bug", "feature", "improvement", "task"] as const;
export type BacklogTaskType = (typeof WORK_ITEM_TYPES)[number];
export type BacklogTaskTypeFilter = "all" | string;
export type ExecLogName = "events" | "stderr" | "last_message";
export type ExecutionMode = "uat" | "inplace";

export function is_backlog_file_kind(tab: BacklogTab): tab is BacklogFileKind {
  return tab !== "processing" && tab !== "failed";
}

/** Read side: as-written (case-normalized), "" when absent. NEVER coerces. */
export function read_task_type(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function is_known_task_type(value: unknown): value is BacklogTaskType {
  return (WORK_ITEM_TYPES as readonly string[]).includes(read_task_type(value));
}

/** Write-side clamp: only for values that must LAND in the ruled enum
 *  (template/H1 rendering fed by our own pickers). Read paths must use
 *  read_task_type instead — coercing at-rest values violates the ruling. */
export function normalize_task_type(value: any): BacklogTaskType {
  const t = read_task_type(value);
  return is_known_task_type(t) ? (t as BacklogTaskType) : "task";
}

export function task_type_tag(tt: BacklogTaskType): string {
  return tt.toUpperCase();
}

/** Chip class for a read-side type value; unknown values get the muted
 *  "labeled unknown" look, never a known type's color. */
export function task_type_chip(tt: string): string {
  if (tt === "bug") return "danger";
  if (tt === "feature") return "ok";
  if (tt === "improvement") return "info";
  if (tt === "task") return "task";
  return "muted";
}

/** Tooltip for unknown at-rest types (render honesty, not rejection). */
export function task_type_title(tt: string): string | undefined {
  return is_known_task_type(tt) ? undefined : `"${tt}" is not in the ruled type vocabulary (${WORK_ITEM_TYPES.join(" / ")})`;
}

export function strip_title_type_prefix(title: string): string {
  const s = String(title || "").trim();
  const out = s.replace(/^\[(bug|feature|improvement|task)\]\s*/i, "").trim();
  return out || s;
}

export function short_id(value: string, keep: number): string {
  const s = String(value || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, Math.max(0, keep - 1))}…`;
}

export function is_parsed(item: BacklogItemSummary): boolean {
  if (typeof (item as any)?.parsed === "boolean") return Boolean((item as any).parsed);
  return typeof item.item_id === "number" && item.item_id > 0;
}

export function infer_backlog_package(item: BacklogItemSummary | null): string {
  const p = String(item?.package || "").trim();
  if (p) return p;
  const fn = String(item?.filename || "").trim();
  const parts = fn.split("-");
  if (parts.length >= 2) return String(parts[1] || "").trim();
  return "";
}

export function format_created_at(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${hh}${mm}`;
}

export function safe_json_parse(line: string): any | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function is_near_bottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }, threshold_px: number): boolean {
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= threshold_px;
}

export function summary_preview_markdown(text: string): string {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return "";
  const lines = raw.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const s = String(line || "");
    if (!s.trim()) {
      if (out.length) break;
      continue;
    }
    out.push(s);
    if (out.length >= 6) break;
  }
  return out.join("\n").trim();
}

export function parse_iso_ms(ts: any): number | null {
  const s = typeof ts === "string" ? ts.trim() : "";
  if (!s) return null;
  const normalized = s.replace(/(\.\d{3})\d+/, "$1");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function format_duration_ms(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const total_s = Math.max(0, Math.floor(ms / 1000));
  const s = total_s % 60;
  const total_m = Math.floor(total_s / 60);
  const m = total_m % 60;
  const total_h = Math.floor(total_m / 60);
  const h = total_h % 24;
  const d = Math.floor(total_h / 24);
  if (d > 0) return `${d}d ${h}h`;
  if (total_h > 0) return `${total_h}h ${m}m`;
  if (total_m > 0) return `${total_m}m ${s}s`;
  return `${total_s}s`;
}

export async function sha256_hex(text: string): Promise<string> {
  const payload = String(text || "");
  const enc = new TextEncoder().encode(payload);
  const c: any = (globalThis as any).crypto;
  if (!c || !c.subtle || typeof c.subtle.digest !== "function") return "";
  const digest = await c.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { is_safe_run_id, session_memory_run_id } from "../../lib/session_run_id";

/** Map an exec-request status to the chip class used across list + detail. */
export function exec_status_chip_class(status: string): string {
  const st = String(status || "").trim().toLowerCase();
  return st === "completed" || st === "promoted"
    ? "ok"
    : st === "failed"
      ? "danger"
      : st === "running"
        ? "info"
        : st === "queued" || st === "awaiting_qa"
          ? "warn"
          : "muted";
}

/** Exec-request status filter for each backlog tab view. */
export function exec_status_filter_for_view(tab: BacklogTab, completed_view: "tasks" | "runs"): string {
  if (tab === "processing") return "queued,running,awaiting_qa";
  if (tab === "failed") return "failed";
  if (tab === "completed" && completed_view === "runs") return "completed,promoted";
  return "";
}

/** Fold a full exec-request payload into the list-row summary shape. */
export function exec_summary_from_payload(payload: any, request_id: string): BacklogExecRequestSummary {
  const p = payload && typeof payload === "object" ? payload : {};
  const backlog = p.backlog && typeof p.backlog === "object" ? p.backlog : {};
  const result = p.result && typeof p.result === "object" ? p.result : {};
  const executor = p.executor && typeof p.executor === "object" ? p.executor : {};
  const last_msg = String(result.last_message || "").trim();
  const target_model = String(p.target_model || executor.model || "").trim();
  const target_reasoning_effort = String(p.target_reasoning_effort || executor.reasoning_effort || "").trim();
  return {
    request_id,
    status: String(p.status || "unknown"),
    created_at: p.created_at ?? null,
    started_at: p.started_at ?? null,
    finished_at: p.finished_at ?? null,
    backlog_relpath: backlog.relpath ?? null,
    backlog_kind: backlog.kind ?? null,
    backlog_filename: backlog.filename ?? null,
    target_agent: p.target_agent ?? null,
    target_model: target_model || null,
    target_reasoning_effort: target_reasoning_effort || null,
    executor_type: executor.type ?? null,
    ok: typeof result.ok === "boolean" ? result.ok : null,
    exit_code: typeof result.exit_code === "number" ? result.exit_code : result.exit_code ?? null,
    error: typeof result.error === "string" ? result.error : result.error ?? null,
    run_dir_relpath: p.run_dir_relpath ?? null,
    last_message: bounded_last_message(last_msg),
  };
}

// ADR-0026 §1: mirrors the gateway's own summary bound. This string is the
// operator's read of HOW a run ended — a silent cut reads as "that is all it
// said", so the cut names itself and where the whole message lives.
const LAST_MESSAGE_CHARS = 1200;

export function bounded_last_message(text: string | null | undefined): string | null {
  const s = String(text || "");
  if (!s) return null;
  if (s.length <= LAST_MESSAGE_CHARS) return s;
  // [#TRUNCATION] backlog-exec last_message bound; the run dir holds the full text
  return `${s.slice(0, LAST_MESSAGE_CHARS)}\n… [#TRUNCATION: ${LAST_MESSAGE_CHARS} of ${s.length} chars; the full last_message is in the run directory]`;
}

export type ParsedExecEvent = { idx: number; type: string; payload: any; raw: string };
export type ParsedExecEvents = { total: number; bad: number; events: ParsedExecEvent[]; raw: string };

/** Parse a JSONL exec events log into typed rows (bad lines become type="raw"). */
export function parse_exec_events(raw_text: string): ParsedExecEvents {
  const raw = String(raw_text || "");
  const lines = raw.split(/\r?\n/).filter((l) => String(l || "").trim().length > 0);
  const events: ParsedExecEvent[] = [];
  let bad = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "").trim();
    const obj = safe_json_parse(line);
    if (!obj || typeof obj !== "object") {
      bad += 1;
      events.push({ idx: i, type: "raw", payload: null, raw: line });
      continue;
    }
    const t = String((obj as any).type || (obj as any).event || "event");
    events.push({ idx: i, type: t, payload: obj, raw: line });
  }
  return { total: lines.length, bad, events, raw };
}

export type ExecEventStats = {
  has_tokens: boolean;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  command_count: number;
  command_fail_count: number;
};

/** Aggregate token usage + command counts from parsed exec events. */
export function exec_event_stats(parsed: ParsedExecEvents | null): ExecEventStats | null {
  if (!parsed) return null;
  let input_tokens = 0;
  let cached_input_tokens = 0;
  let output_tokens = 0;
  let command_count = 0;
  let command_fail_count = 0;
  for (const ev of parsed.events) {
    const p: any = ev.payload;
    const usage = p && typeof p.usage === "object" ? p.usage : null;
    if (usage) {
      if (Number.isFinite(Number(usage.input_tokens))) input_tokens += Number(usage.input_tokens);
      if (Number.isFinite(Number(usage.cached_input_tokens))) cached_input_tokens += Number(usage.cached_input_tokens);
      if (Number.isFinite(Number(usage.output_tokens))) output_tokens += Number(usage.output_tokens);
    }
    const item = p && typeof p.item === "object" ? p.item : null;
    if (item && String(item.type || "").trim() === "command_execution") {
      command_count += 1;
      const st = String(item.status || "").trim().toLowerCase();
      if (st === "failed") command_fail_count += 1;
    }
  }
  const has_tokens = input_tokens > 0 || output_tokens > 0 || cached_input_tokens > 0;
  return {
    has_tokens,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    total_tokens: input_tokens + output_tokens,
    command_count,
    command_fail_count,
  };
}

export type ExecTimeStats = {
  is_done: boolean;
  queue_delay_ms: number | null;
  run_ms: number | null;
  total_ms: number | null;
  age_ms: number | null;
};

/** Queue delay / run time / total time / live age for an exec request. */
export function exec_time_stats(req: BacklogExecRequestSummary | null, now_ms: number = Date.now()): ExecTimeStats {
  const created_ms = parse_iso_ms(req?.created_at);
  const started_ms = parse_iso_ms(req?.started_at);
  const finished_ms = parse_iso_ms(req?.finished_at);
  const st = String(req?.status || "").trim().toLowerCase();
  const end_ms = finished_ms ?? (st === "running" ? now_ms : null);
  const is_done = finished_ms != null;
  const queue_delay_ms = created_ms != null && started_ms != null ? Math.max(0, started_ms - created_ms) : null;
  const run_ms = started_ms != null && end_ms != null ? Math.max(0, end_ms - started_ms) : null;
  const total_ms = created_ms != null && end_ms != null ? Math.max(0, end_ms - created_ms) : null;
  const age_ms = !is_done && created_ms != null ? Math.max(0, now_ms - created_ms) : null;
  return { is_done, queue_delay_ms, run_ms, total_ms, age_ms };
}

// ------------------------------------------------------------ draft rendering

export function render_backlog_template_draft(
  template_md: string,
  opts: { package_name: string; title: string; summary: string; created_at: string; task_type: BacklogTaskType }
): string {
  const pkg = String(opts.package_name || "").trim() || "{Package}";
  const title = strip_title_type_prefix(String(opts.title || "").trim() || "{Title}");
  const summary = String(opts.summary || "").trim();
  const tt = normalize_task_type(opts.task_type);

  const header = `# {ID}-${pkg}: [${task_type_tag(tt)}] ${title}`.trim();
  let out = String(template_md || "");
  out = out.split("{Package}").join(pkg).split("{Title}").join(title);

  // Force first H1.
  const lines = out.split(/\r?\n/);
  let replaced_h1 = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = String(lines[i] || "");
    if (raw.trim().startsWith("# ")) {
      lines[i] = header;
      replaced_h1 = true;
      break;
    }
    if (raw.trim()) break;
  }
  if (!replaced_h1) {
    lines.unshift("", header);
    lines.shift();
  }

  // Ensure Created line.
  const created_line = `> Created: ${String(opts.created_at || "").trim()}`.trim();
  let found_created = false;
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const raw = String(lines[i] || "");
    if (raw.trim().toLowerCase().startsWith("> created:")) {
      lines[i] = created_line;
      found_created = true;
      break;
    }
  }
  if (!found_created) {
    const insert_at = lines.length > 1 && !String(lines[1] || "").trim() ? 2 : 1;
    lines.splice(insert_at, 0, created_line, "");
  }

  // Ensure Type line.
  const type_line = `> Type: ${tt}`.trim();
  let found_type = false;
  for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
    const raw = String(lines[i] || "");
    if (raw.trim().toLowerCase().startsWith("> type:")) {
      lines[i] = type_line;
      found_type = true;
      break;
    }
  }
  if (!found_type) {
    let created_idx = -1;
    for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
      const raw = String(lines[i] || "");
      if (raw.trim().toLowerCase().startsWith("> created:")) {
        created_idx = i;
        break;
      }
    }
    if (created_idx >= 0) {
      const insert_at = created_idx + 1;
      if (insert_at < lines.length && !String(lines[insert_at] || "").trim()) {
        lines.splice(insert_at, 0, type_line);
      } else {
        lines.splice(insert_at, 0, type_line, "");
      }
    } else {
      const insert_at = lines.length > 1 && !String(lines[1] || "").trim() ? 2 : 1;
      lines.splice(insert_at, 0, type_line, "");
    }
  }

  if (summary) {
    for (let i = 0; i < lines.length; i += 1) {
      if (String(lines[i] || "").trim().toLowerCase() === "## summary") {
        let j = i + 1;
        while (j < lines.length && !String(lines[j] || "").trim()) j += 1;
        const placeholder = j < lines.length ? String(lines[j] || "") : "";
        if (placeholder.trim().toLowerCase().startsWith("one paragraph describing")) {
          lines[j] = summary;
        } else {
          lines.splice(i + 1, 0, summary, "");
        }
        break;
      }
    }
  }

  out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

export function lines_list(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function generate_backlog_draft_from_guided(opts: {
  package_name: string;
  title: string;
  task_type: BacklogTaskType;
  summary: string;
  diagram: string;
  context: string;
  included: string[];
  excluded: string[];
  plan: string[];
  dependencies: string[];
  acceptance: string[];
  tests_a: string[];
  tests_b: string[];
  tests_c: string[];
  created_at: string;
  attachments: string[];
}): string {
  const pkg = String(opts.package_name || "").trim() || "{Package}";
  const title = strip_title_type_prefix(String(opts.title || "").trim() || "{Title}");
  const tt = normalize_task_type(opts.task_type);
  const created = String(opts.created_at || "").trim() || format_created_at();
  const diagram = String(opts.diagram || "").trim();
  const context = String(opts.context || "").trim();

  const md: string[] = [];
  md.push(`# {ID}-${pkg}: [${task_type_tag(tt)}] ${title}`);
  md.push("");
  md.push(`> Created: ${created}`);
  md.push(`> Type: ${tt}`);
  md.push("");
  md.push("## Summary");
  md.push(opts.summary.trim() || "One paragraph describing what this task accomplishes (user value + outcome).");
  md.push("");
  md.push("## Diagram");
  md.push("```");
  md.push(diagram || "ASCII diagram of the system change.\nShow inputs/outputs and where code lives.");
  md.push("```");
  md.push("");
  md.push("## Context");
  md.push(context || "(why is this needed? link to evidence: bug/feature report paths, discussions, etc.)");
  md.push("");
  md.push("## Scope");
  md.push("### Included");
  if (opts.included.length) md.push(...opts.included.map((s) => `- ${s}`));
  else md.push("- ");
  md.push("");
  md.push("### Excluded");
  if (opts.excluded.length) md.push(...opts.excluded.map((s) => `- ${s}`));
  else md.push("- ");
  md.push("");
  md.push("## Implementation Plan");
  if (opts.plan.length) md.push(...opts.plan.map((s, i) => `${i + 1}. ${s}`));
  else md.push("1. ");
  md.push("");
  md.push("## Dependencies");
  if (opts.dependencies.length) md.push(...opts.dependencies.map((s) => `- ${s}`));
  else md.push("- Related backlog items / ADRs");
  md.push("");
  md.push("## Acceptance Criteria");
  if (opts.acceptance.length) md.push(...opts.acceptance.map((s) => `- [ ] ${s}`));
  else md.push("- [ ] Criterion 1 (clear, testable)");
  md.push("");
  md.push("## Testing (ADR-0019)");
  md.push("- Level A:");
  if (opts.tests_a.length) md.push(...opts.tests_a.map((s) => `  - \`${s}\``));
  else md.push("  - `...`");
  md.push("- Level B:");
  if (opts.tests_b.length) md.push(...opts.tests_b.map((s) => `  - \`${s}\``));
  else md.push("  - `...`");
  md.push("- Level C (optional / opt-in):");
  if (opts.tests_c.length) md.push(...opts.tests_c.map((s) => `  - \`${s}\``));
  else md.push("  - n/a");
  md.push("");
  md.push("## Related");
  md.push("- ADRs:");
  md.push("- Code:");
  md.push("- Reports:");
  if (opts.attachments.length) {
    md.push("- Attachments:");
    md.push(...opts.attachments.map((p) => `  - ${p}`));
  }
  md.push("");
  md.push("---");
  md.push("## Report (added when completed)");
  md.push("");
  md.push("> Completed: YYYY-MM-DD");
  md.push("");
  md.push("### What changed");
  md.push("- ");
  md.push("");
  md.push("### Security / hardening");
  md.push("- ");
  md.push("");
  md.push("### Testing (ADR-0019)");
  md.push("Levels executed:");
  md.push("- A:");
  md.push("- B:");
  md.push("- C (if any):");
  md.push("");
  md.push("Commands run:");
  md.push("- `...`");
  md.push("");
  md.push("### Follow-ups");
  md.push("- ");
  md.push("");
  return md.join("\n");
}

export function insert_attachment_links(md: string, relpaths: string[]): string {
  const paths = relpaths.map((p) => String(p || "").trim()).filter(Boolean);
  if (!paths.length) return md;
  const lines = String(md || "").split(/\r?\n/);
  const lower = lines.map((l) => l.toLowerCase());

  const related_idx = lower.findIndex((l) => l.trim() === "## related");
  if (related_idx < 0) {
    const out = String(md || "").trimEnd();
    return `${out}\n\n## Related\n- Attachments:\n${paths.map((p) => `  - ${p}`).join("\n")}\n`;
  }

  let attach_idx = -1;
  for (let i = related_idx + 1; i < lines.length; i += 1) {
    const l = lower[i].trim();
    if (l.startsWith("## ") || l.startsWith("---")) break;
    if (l.startsWith("- attachments:")) {
      attach_idx = i;
      break;
    }
  }

  const attach_block = ["- Attachments:", ...paths.map((p) => `  - ${p}`)];
  if (attach_idx >= 0) {
    // Append new entries AFTER the existing attachment entries (backlog
    // 0006): the old walk trimmed each line before testing the "  -"
    // continuation prefix — trimming eats the indent, so the walk broke at
    // the first entry and new links PREPENDED. Test the raw line: any
    // indented list item is still part of the block (two-space is what we
    // write; deeper/tab indents from hand-edited files stay covered).
    let insert_at = attach_idx + 1;
    while (insert_at < lines.length) {
      if (!/^\s+-\s/.test(lines[insert_at])) break;
      insert_at += 1;
    }
    lines.splice(insert_at, 0, ...paths.map((p) => `  - ${p}`));
  } else {
    // Insert before the next section or divider.
    let insert_at = related_idx + 1;
    for (let i = related_idx + 1; i < lines.length; i += 1) {
      const l = lower[i].trim();
      if (l.startsWith("## ") || l.startsWith("---")) {
        insert_at = i;
        break;
      }
      insert_at = i + 1;
    }
    lines.splice(insert_at, 0, ...attach_block, "");
  }
  return lines.join("\n");
}
