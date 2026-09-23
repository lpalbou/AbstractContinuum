// Pure model for the Board: work-item metadata parsed from the markdown
// convention lines, Definition-of-Ready evaluation, and the column
// derivation that joins backlog items with exec requests.
//
// Metadata convention (extends the template's existing "> Created:" /
// "> Type:" lines — human-readable, agent-writable, no new storage):
//   > Priority: P1          (P0 critical | P1 high | P2 normal | P3 low)
//   > Labels: ui, security, sprint-29
import type { BacklogExecRequestSummary, BacklogItemSummary } from "../../lib/gateway_client";
import { type WorkClaim, basename_of_card_path, parse_work_id, work_id_for_item } from "../../lib/work_id";
import { WORK_ITEM_TYPES } from "../backlog/model";

export type WorkPriority = "P0" | "P1" | "P2" | "P3";

export const PRIORITIES: WorkPriority[] = ["P0", "P1", "P2", "P3"];

export const PRIORITY_LABELS: Record<WorkPriority, string> = {
  P0: "P0 · critical",
  P1: "P1 · high",
  P2: "P2 · normal",
  P3: "P3 · low",
};

export type WorkItemMetadata = {
  priority: WorkPriority | null;
  labels: string[];
  /** Checkbox bullets under "## Acceptance Criteria". */
  acceptance: Array<{ text: string; checked: boolean }>;
  /** Backtick commands under "## Testing" levels A/B (C is optional by template). */
  test_commands: string[];
  /** True when the Summary section has real prose (not the template placeholder). */
  has_summary: boolean;
};

const PRIORITY_RE = /^>\s*priority:\s*(p[0-3])\b/i;
const LABELS_RE = /^>\s*labels:\s*(.+)$/i;

export function parse_labels_line(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((s) => Boolean(s) && s.length <= 40)
    .slice(0, 12);
}

function section_lines(lines: string[], heading_re: RegExp): string[] {
  // Any heading depth switches sections (### Acceptance Criteria counts;
  // adversarial find: H3 sections were invisible before).
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) {
      inside = heading_re.test(t);
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

const TEMPLATE_PLACEHOLDERS = [
  "one paragraph describing",
  "criterion 1 (clear, testable)",
];

function is_placeholder(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  return TEMPLATE_PLACEHOLDERS.some((p) => t.startsWith(p));
}

/** Parse the metadata + quality signals out of a work item's markdown. */
export function parse_work_item_metadata(content: string): WorkItemMetadata {
  const lines = String(content || "").split(/\r?\n/);

  let priority: WorkPriority | null = null;
  let labels: string[] = [];
  // Metadata lines live in the HEADER BLOCK only: stop at the first
  // section heading so a quoted "> Priority:" inside Summary/Context can
  // never be read as item metadata (adversarial find, 2026-07-12).
  for (const line of lines.slice(0, 60)) {
    const t = line.trim();
    if (/^##+\s/.test(t)) break;
    const p = PRIORITY_RE.exec(t);
    if (p && !priority) priority = p[1].toUpperCase() as WorkPriority;
    const l = LABELS_RE.exec(t);
    if (l && !labels.length) labels = parse_labels_line(l[1]);
  }

  const acceptance: Array<{ text: string; checked: boolean }> = [];
  for (const line of section_lines(lines, /acceptance criteria/i)) {
    const m = /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(line);
    if (!m) continue;
    const text = m[2].trim();
    if (is_placeholder(text)) continue;
    acceptance.push({ text, checked: m[1].toLowerCase() === "x" });
  }

  const test_commands: string[] = [];
  for (const line of section_lines(lines, /testing/i)) {
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const cmd = m[1].trim();
      if (!cmd || cmd === "..." || cmd.toLowerCase() === "n/a") continue;
      test_commands.push(cmd);
    }
  }

  // Prefix match: "## Summary (short)" and similar variants still count.
  const summary_lines = section_lines(lines, /^#{1,6}\s*summary\b/i)
    .map((l) => l.trim())
    .filter(Boolean);
  const has_summary = summary_lines.length > 0 && !summary_lines.every(is_placeholder);

  return { priority, labels, acceptance, test_commands, has_summary };
}

// ------------------------------------------------------- Definition of Ready

export type ReadinessCheck = { id: string; label: string; ok: boolean; evidence?: string };

export type Readiness = { ok: boolean; checks: ReadinessCheck[] };

/**
 * Definition of Ready: what a work item must carry before an execution
 * agent is unleashed on it. Evaluated from the spec markdown; surfaced as
 * a named checklist WITH parse evidence (what was actually found), so a
 * mis-parse is visible instead of just red. Advisory by design: the
 * operator can override (gates that cannot be overridden get worked
 * around); the server-side gate is a filed gateway ask.
 */
export function evaluate_readiness(item: Pick<BacklogItemSummary, "task_type">, meta: WorkItemMetadata): Readiness {
  const type = String(item.task_type || "").trim().toLowerCase();
  const checks: ReadinessCheck[] = [
    {
      id: "type",
      label: `Work type is set (${WORK_ITEM_TYPES.join(" / ")})`,
      ok: (WORK_ITEM_TYPES as readonly string[]).includes(type),
      evidence: type ? `type: ${type}` : "no type",
    },
    {
      id: "summary",
      label: "Summary describes the outcome (not the template placeholder)",
      ok: meta.has_summary,
      evidence: meta.has_summary ? "summary present" : "empty or template placeholder",
    },
    {
      id: "acceptance",
      label: "At least one acceptance criterion",
      ok: meta.acceptance.length > 0,
      evidence: meta.acceptance.length ? `found ${meta.acceptance.length}: "${short_id(meta.acceptance[0].text, 60)}"${meta.acceptance.length > 1 ? ", …" : ""}` : "none found under ## Acceptance Criteria",
    },
    {
      id: "tests",
      label: "At least one concrete test command (Testing A/B)",
      ok: meta.test_commands.length > 0,
      evidence: meta.test_commands.length ? `found ${meta.test_commands.length}: \`${short_id(meta.test_commands[0], 60)}\`` : "none found under ## Testing",
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function short_id(value: string, keep: number): string {
  const s = String(value || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, Math.max(0, keep - 1))}…`;
}

/**
 * Convert the server DoR gate's 409 refusal (gateway c1140, shipped to
 * our c1124 contract) into the Readiness shape the modal renders.
 * Duck-typed on {status, body} so any error transport works; returns
 * null for anything that is not a structured DoR refusal.
 */
export function readiness_from_dor_refusal(err: unknown): Readiness | null {
  const e = err as { status?: number; body?: any } | null;
  if (!e || e.status !== 409) return null;
  // FastAPI wraps HTTPException detail as {"detail": {...}} — the gateway's
  // own test pins that wrapping. Accept both shapes (adversarial P0
  // 2026-07-13: the parser read only the top level, so every server DoR
  // refusal fell through to the raw-JSON error path and override never
  // armed — a hand-written test double had hidden the seam).
  const raw = e.body;
  const body = raw && typeof raw === "object" && raw.detail && typeof raw.detail === "object" ? raw.detail : raw;
  if (!body || body.error !== "definition_of_ready_failed") return null;
  const raw_checks = Array.isArray(body.checks)
    ? body.checks
    : // Batch refusals name which members failed; fold them flat with the
      // member path prefixed so one checklist stays renderable.
      Array.isArray(body.members)
      ? body.members.flatMap((m: any) =>
          (Array.isArray(m?.checks) ? m.checks : []).map((c: any) => ({
            ...c,
            label: m?.relpath ? `${m.relpath}: ${String(c?.label || "")}` : c?.label,
          }))
        )
      : [];
  const checks: ReadinessCheck[] = raw_checks.map((c: any) => ({
    id: String(c?.id || ""),
    label: String(c?.label || ""),
    ok: c?.ok === true,
    evidence: c?.evidence ? String(c.evidence) : undefined,
  }));
  if (!checks.length) return null;
  return { ok: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------- metadata line editing

/** Upsert the "> Priority:" / "> Labels:" lines in a spec's header block. */
export function write_metadata_lines(content: string, meta: { priority: WorkPriority | null; labels: string[] }): string {
  const lines = String(content || "").split(/\r?\n/);
  const out = [...lines];

  function upsert(re: RegExp, line: string | null): void {
    // Collect EVERY matching line in the header block (duplicates happen
    // when agents copy headers): replace the first, drop the rest.
    const matches: number[] = [];
    for (let i = 0; i < Math.min(out.length, 60); i += 1) {
      const t = out[i].trim();
      if (/^##+\s/.test(t)) break;
      if (re.test(t)) matches.push(i);
    }
    if (matches.length) {
      for (let j = matches.length - 1; j >= 1; j -= 1) out.splice(matches[j], 1);
      if (line) out[matches[0]] = line;
      else out.splice(matches[0], 1);
      return;
    }
    if (!line) return;
    // Insert after the last "> ..." metadata line in the header block, or
    // after the H1 when none exist; a document with neither gets the line
    // prepended (index 0), never spliced mid-body.
    let insert_at = -1;
    for (let i = 0; i < Math.min(out.length, 60); i += 1) {
      const t = out[i].trim();
      if (t.startsWith("> ")) insert_at = i;
      if (/^##\s/.test(t)) break;
    }
    if (insert_at < 0) {
      const h1 = out.findIndex((l) => l.trim().startsWith("# "));
      if (h1 >= 0) insert_at = h1;
      else {
        out.unshift(line);
        return;
      }
    }
    out.splice(insert_at + 1, 0, line);
  }

  upsert(PRIORITY_RE, meta.priority ? `> Priority: ${meta.priority}` : null);
  upsert(LABELS_RE, meta.labels.length ? `> Labels: ${meta.labels.join(", ")}` : null);
  return out.join("\n");
}

// ------------------------------------------------------------- board columns

export type BoardColumnId = "triage" | "ready" | "in_progress" | "in_review" | "done" | "failed";

export const BOARD_COLUMNS: Array<{ id: BoardColumnId; label: string; hint: string }> = [
  { id: "triage", label: "Triage", hint: "Proposed — needs a decision (merge/advisor tooling lives on the Backlog page)" },
  { id: "ready", label: "Ready", hint: "Planned — executable. A ⚠ badge counts recent failed attempts." },
  { id: "in_progress", label: "In Progress", hint: "Queued/running executions + seat-claimed items (live hub pointer claims — the ⛏ chip names the owner)" },
  { id: "in_review", label: "In Review", hint: "Awaiting QA decision (receipts-posted seat work joins when the /work index is live)" },
  { id: "done", label: "Done", hint: "Recent promotions/completions (attempts). The full archive lives in Backlog → Completed." },
  { id: "failed", label: "Failed", hint: "Recent failed attempts (history) — the item itself stays executable in Ready" },
];

export type BoardCard = {
  /**
   * Stable key. Live cards (in_progress / in_review) are the ITEM
   * (`file:<name>`; batch = `req:<id>`); terminal cards (done / failed)
   * are the ATTEMPT (`req:<id>`) — so a failed attempt and the re-ready
   * file coexist without key collisions, and two batches never collide.
   */
  key: string;
  column: BoardColumnId;
  title: string;
  /** File identity (absent for batch cards). */
  kind?: "proposed" | "planned" | "completed";
  filename?: string;
  item_id?: number;
  package?: string;
  task_type?: string;
  summary?: string;
  /** Exec identity when an execution carries/accompanies the card. */
  request_id?: string;
  exec_status?: string;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  target_agent?: string | null;
  /** Batch executions cover several items in one request. */
  batch_size?: number;
  /** Ready cards: recent failed attempts for this file (retry badge). */
  recent_failures?: number;
  /** SEAT-WORK lane (S3 join, decision:work-item-vocabulary): a planned
   *  file with a live pointer claim renders in-progress — these carry the
   *  claim's owner + start for the "claimed by X · Nh" chip. Rendered,
   *  never stored (the claim row holds ownership only). */
  work_id?: string;
  claim_owner?: string;
  claim_started_at?: string | number;
  /** Hub work-row card path (repo-relative) — the drawer's probe input
   *  and dedup key 2 (dm 110). */
  card_path?: string;
  /** List-level metadata (gateways ≥ c1090 serve these in summaries —
   *  exact, no content fetch; undefined = older gateway). */
  priority?: WorkPriority | null;
  labels?: string[];
};

/** Minimal shape of the gateway's batch-aware active-items expansion. */
export type ActiveExecItem = { request_id: string; status: string; kind: string; filename: string; relpath: string };

/** Normalize a list-summary priority value ("" / garbage → null). */
export function normalize_list_priority(value: unknown): WorkPriority | null {
  const v = String(value || "").trim().toUpperCase();
  return (PRIORITIES as string[]).includes(v) ? (v as WorkPriority) : null;
}

/** True when a list summary carries the c1090 metadata keys at all. */
export function summary_has_list_metadata(item: BacklogItemSummary): boolean {
  return (item as any).priority !== undefined || (item as any).labels !== undefined;
}

/** The label that marks an item as an OPERATOR DECISION GATE (room
 *  supervision directive, c1631): rendered as a gate, never executable,
 *  never draggable — "Laurent's gates stay his" is a UI guarantee, not
 *  etiquette. Label-driven on purpose: the work-item type vocabulary is
 *  ruled (bug/feature/improvement/task) and a gate is not a fifth type. */
export const DECISION_GATE_LABEL = "decision-gate";

export function is_decision_gate(labels: string[] | undefined | null): boolean {
  return Array.isArray(labels) && labels.some((l) => String(l || "").trim().toLowerCase() === DECISION_GATE_LABEL);
}

/** Gate check for a card: list metadata first, content-scan fallback. */
export function card_is_decision_gate(card: BoardCard, meta?: WorkItemMetadata | null): boolean {
  return is_decision_gate(card.labels !== undefined ? card.labels : meta?.labels);
}

// Chip precedence: LIST-level metadata (exact, gateway-parsed) wins over
// the lazy content-scan cache (#FALLBACK for older gateways). `undefined`
// on the card = list didn't answer; `null`/[] = list answered "none".
export function card_has_chip_meta(card: BoardCard): boolean {
  return card.priority !== undefined || card.labels !== undefined;
}

export function chip_priority(card: BoardCard, meta?: WorkItemMetadata | null): WorkPriority | null {
  if (card.priority !== undefined) return card.priority;
  return meta?.priority ?? null;
}

export function chip_labels(card: BoardCard, meta?: WorkItemMetadata | null): string[] {
  if (card.labels !== undefined) return card.labels;
  return meta?.labels ?? [];
}

const ACTIVE_STATUSES = new Set(["queued", "running"]);

function filename_from_relpath(relpath: string): string {
  const parts = String(relpath || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

// Batch requests carry a synthetic "batch(N)" filename (gateway
// backlog_execute_batch); treating it as a real file poisoned the join
// (duplicate keys, phantom Ready cards, drawer 404s — adversarial design
// review, 2026-07-12). Detect and strip it.
const BATCH_FILENAME_RE = /^batch\((\d+)\)$/i;

export function parse_batch_filename(filename: string): number | null {
  const m = BATCH_FILENAME_RE.exec(String(filename || "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Derive board columns from the gateway's sources of truth:
 * - backlog FILE lists (proposed / planned) -> Triage / Ready
 * - exec REQUESTS -> In Progress / In Review (live) + Done / Failed (recent attempts)
 * - active_items -> the BUSY SET (batch-aware: the gateway expands
 *   backlog_queue members; the same source the Backlog page hides
 *   planned-while-processing items with — one busy answer everywhere).
 *
 * Ruled semantics (adversarial design review, 2026-07-12):
 * - ONE source per column: Done/Failed are recent ATTEMPTS (requests);
 *   the completed-file archive lives on the Backlog page.
 * - A file with a LIVE request renders only as its execution card; batch
 *   requests render as one multi-item card (`req:` key, no filename).
 * - A FAILED attempt does not hide its file: the file stays executable in
 *   Ready carrying a failure badge — the Failed lane is history.
 */
export function derive_board_cards(inputs: {
  proposed: BacklogItemSummary[];
  planned: BacklogItemSummary[];
  /** Live requests (queued/running/awaiting_qa) — status-scoped fetch. */
  active_requests: BacklogExecRequestSummary[];
  /** Recent terminal requests (promoted/completed/failed) — separate fetch. */
  terminal_requests: BacklogExecRequestSummary[];
  /** Gateway's batch-aware expansion of items with live requests. */
  active_items: ActiveExecItem[];
  /** Cap Done/Failed lanes to recent history (board is a flow, not an archive). */
  recent_limit?: number;
}): BoardCard[] {
  const recent_limit = inputs.recent_limit ?? 12;
  const cards: BoardCard[] = [];

  // Busy set: every file the gateway says is inside a live request
  // (single or batch member) — never derived from request filenames alone.
  const busy_filenames = new Set<string>();
  for (const it of inputs.active_items) {
    const fn = String(it.filename || "").trim();
    if (fn) busy_filenames.add(fn);
  }

  const request_card = (r: BacklogExecRequestSummary, column: BoardColumnId, is_live: boolean): BoardCard => {
    const raw_filename = String(r.backlog_filename || "").trim() || filename_from_relpath(String(r.backlog_relpath || ""));
    const batch_size = parse_batch_filename(raw_filename);
    const filename = batch_size !== null ? "" : raw_filename;
    if (filename && is_live) busy_filenames.add(filename);
    return {
      key: filename && is_live ? `file:${filename}` : `req:${r.request_id}`,
      column,
      title: batch_size !== null ? `Batch execution (${batch_size} items)` : filename || `Execution ${r.request_id.slice(0, 8)}…`,
      filename: filename || undefined,
      request_id: r.request_id,
      exec_status: String(r.status || "").trim().toLowerCase(),
      created_at: r.created_at ?? null,
      started_at: r.started_at ?? null,
      finished_at: r.finished_at ?? null,
      // Executor-agnostic attribution (never fabricate a codex label).
      target_agent: r.target_agent ?? (r.target_model ? `${String((r as any).executor_type || "agent").trim() || "agent"}:${r.target_model}` : null),
      batch_size: batch_size !== null ? batch_size : undefined,
    };
  };

  for (const r of inputs.active_requests) {
    const st = String(r.status || "").trim().toLowerCase();
    if (ACTIVE_STATUSES.has(st)) cards.push(request_card(r, "in_progress", true));
    else if (st === "awaiting_qa") cards.push(request_card(r, "in_review", true));
  }

  const sorted_terminal = [...inputs.terminal_requests].sort((a, b) => {
    const ta = String(a.finished_at || a.started_at || a.created_at || "");
    const tb = String(b.finished_at || b.started_at || b.created_at || "");
    return tb.localeCompare(ta);
  });
  const failures_by_filename = new Map<string, number>();
  let done_count = 0;
  let failed_count = 0;
  for (const r of sorted_terminal) {
    const st = String(r.status || "").trim().toLowerCase();
    if (st === "failed") {
      const raw = String(r.backlog_filename || "").trim();
      if (raw && parse_batch_filename(raw) === null) {
        failures_by_filename.set(raw, (failures_by_filename.get(raw) || 0) + 1);
      }
      if (failed_count < recent_limit) {
        cards.push(request_card(r, "failed", false));
        failed_count += 1;
      }
    } else if ((st === "promoted" || st === "completed") && done_count < recent_limit) {
      cards.push(request_card(r, "done", false));
      done_count += 1;
    }
  }

  for (const it of inputs.planned) {
    const fn = String(it.filename || "").trim();
    if (!fn || busy_filenames.has(fn)) continue;
    cards.push({
      key: `file:${fn}`,
      column: "ready",
      title: it.title || fn,
      kind: "planned",
      filename: fn,
      item_id: it.item_id,
      package: it.package,
      task_type: it.task_type,
      summary: it.summary,
      recent_failures: failures_by_filename.get(fn) || undefined,
      priority: summary_has_list_metadata(it) ? normalize_list_priority(it.priority) : undefined,
      labels: Array.isArray(it.labels) ? it.labels : undefined,
    });
  }

  for (const it of inputs.proposed) {
    const fn = String(it.filename || "").trim();
    if (!fn || busy_filenames.has(fn)) continue;
    cards.push({
      key: `file:${fn}`,
      column: "triage",
      title: it.title || fn,
      kind: "proposed",
      filename: fn,
      item_id: it.item_id,
      package: it.package,
      task_type: it.task_type,
      summary: it.summary,
      priority: summary_has_list_metadata(it) ? normalize_list_priority(it.priority) : undefined,
      labels: Array.isArray(it.labels) ? it.labels : undefined,
    });
  }

  // Enrich execution cards with file facts when the file is in a fetched list.
  const by_filename = new Map<string, BacklogItemSummary>();
  for (const it of [...inputs.planned, ...inputs.proposed]) by_filename.set(String(it.filename || "").trim(), it);
  for (const card of cards) {
    if (!card.filename || card.kind) continue;
    const it = by_filename.get(card.filename);
    if (!it) continue;
    card.title = it.title || card.title;
    card.item_id = it.item_id;
    card.package = it.package;
    card.task_type = it.task_type;
    card.summary = it.summary;
  }

  return cards;
}

/**
 * The SEAT-WORK join (S3 of the unification build; Option A, c3010;
 * widened per operator dm 94 — "the board must reflect team work"):
 * - a PLANNED file whose work id has a LIVE pointer claim renders
 *   in-progress (file card moves; exec attempts still win the column);
 * - a live claim whose item has NO file card on this gateway (work in a
 *   repo the gateway doesn't serve, or intake not yet filed) renders a
 *   SYNTHETIC in-progress card — the operator's "many ongoing tasks yet
 *   In Progress shows 0" gap;
 * - DONE-marked claims render as recent Done cards (team work beside
 *   exec attempts — dm 94 supersedes the exec-only Done ruling).
 * Rendered, never stored; pure so the derivation is pinned without a DOM.
 */
export type DoneClaimEntry = { item: string; owner: string; receipt?: string; updated_at?: number };
export type HubWorkRowEntry = {
  item: string;
  title?: string;
  status: "proposed" | "planned" | "completed" | "deprecated";
  owner?: string;
  receipt?: string;
  card?: string;
};

// dm 103 ("the done category is ridiculously small compared to what we
// did"): Done renders the room's real completed record — every done-marked
// claim, recency-sorted; the column scrolls. The cap is a sanity bound
// only, not a window.
const DONE_CLAIMS_LIMIT = 200;

export function apply_work_claims(cards: BoardCard[], view: { live: Map<string, WorkClaim>; done: DoneClaimEntry[]; work?: Map<string, HubWorkRowEntry> }): BoardCard[] {
  const { live, done } = view;
  const work = view.work || new Map<string, HubWorkRowEntry>();
  if (!live.size && !done.length && !work.size) return cards;
  const matched = new Set<string>();
  // Dedup keys from file cards: derived work id (key 1 — requires the
  // gateway package spelling to match the hub id head, which DIVERGES:
  // umbrella files parse package "framework" vs hub "abstractframework")
  // AND raw filename (key 2 — one authority, both sides; dm 110 audit).
  const file_ids = new Set<string>();
  for (const card of cards) {
    if (!card.filename || !card.package) continue;
    const fid = work_id_for_item(card.package, card.filename);
    if (fid) file_ids.add(fid);
  }
  const out = cards.map((card) => {
    if (card.column !== "ready" || card.kind !== "planned" || !card.filename || !card.package) return card;
    const id = work_id_for_item(card.package, card.filename);
    if (!id) return card;
    const claim = live.get(id);
    if (!claim || !claim.owner) return card;
    matched.add(id);
    return { ...card, column: "in_progress" as BoardColumnId, work_id: id, claim_owner: claim.owner, claim_started_at: claim.started_at };
  });
  // Filename index over the MAPPED cards (wave adversary P1-2): fact
  // transfers must land on the copies this function RETURNS — indexing
  // the caller's originals both mutated React state in place (stale
  // claim chips that survive until a full refetch) and lost transfers
  // aimed at cards the map pass had already replaced.
  const name_idx = new Map<string, number>();
  out.forEach((c, i) => {
    if (c.filename) name_idx.set(c.filename, i);
  });
  // UNIFIED BACKLOG rows (work:<id>, operator dm 105; shape = file words
  // only, skill c3339 + continuum c3343): hub-resident items render on the
  // board REGARDLESS of which gateway serves their file. Column = the
  // stored file word, except planned+live-claim derives in-progress (the
  // ruled derivation, same as file cards). Gateway file cards win dedup
  // (deeper record; the row is the index).
  for (const [id, row] of work) {
    const idx = row.card ? name_idx.get(basename_of_card_path(row.card)) : undefined;
    if (file_ids.has(id) || idx !== undefined) {
      // A gateway file card carries this item — the file is the deeper
      // record and WINS; transfer the hub facts onto it so the drawer
      // can offer the discussion lane (dm 110 design: transfer, don't
      // just skip — dedup used to vanish the row's data). Copy-on-write:
      // the input cards are never touched.
      if (idx !== undefined) {
        const cur = out[idx];
        const upd: BoardCard = { ...cur, work_id: cur.work_id || id, card_path: cur.card_path || row.card };
        const claim = live.get(id);
        if (claim?.owner) {
          matched.add(id); // the claim is represented — no synthetic twin
          if (!upd.claim_owner) {
            upd.claim_owner = claim.owner;
            upd.claim_started_at = claim.started_at;
          }
        }
        out[idx] = upd;
      }
      continue;
    }
    if (row.status === "deprecated") continue; // parked work is not board traffic
    const claim = live.get(id);
    const column: BoardColumnId = row.status === "completed" ? "done" : row.status === "planned" ? (claim?.owner ? "in_progress" : "ready") : "triage";
    if (claim?.owner) matched.add(id);
    out.push({
      key: `work:${id}`,
      column,
      title: row.title || id,
      work_id: id,
      package: parse_work_id(id)?.package,
      summary: row.receipt,
      card_path: row.card,
      claim_owner: claim?.owner || (row.status === "completed" ? row.owner : undefined),
      claim_started_at: claim?.started_at,
    });
  }
  // Synthetic in-progress cards for claims without a file card here.
  for (const [id, claim] of live) {
    if (matched.has(id) || !claim.owner) continue;
    const parsed = parse_work_id(id);
    out.push({
      key: `claim:${id}`,
      column: "in_progress",
      title: typeof (claim as any).task === "string" && (claim as any).task ? (claim as any).task : id,
      work_id: parsed ? id : undefined,
      package: parsed?.package,
      claim_owner: claim.owner,
      claim_started_at: claim.started_at,
    });
  }
  // Recent done team work (dedup against file cards already in Done).
  const seen_done = new Set(out.filter((c) => c.column === "done").map((c) => c.work_id).filter(Boolean));
  for (const d of done.slice(0, DONE_CLAIMS_LIMIT)) {
    if (seen_done.has(d.item)) continue;
    const parsed = parse_work_id(d.item);
    out.push({
      key: `claim-done:${d.item}`,
      column: "done",
      title: d.item,
      work_id: parsed ? d.item : undefined,
      package: parsed?.package,
      claim_owner: d.owner,
      summary: d.receipt,
    });
  }
  return out;
}
