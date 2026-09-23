// Response/request types for the development-lane gateway API families that
// AbstractContinuum consumes: reports, email, triage, backlog CRUD, the
// backlog exec pipeline, managed processes, and the few shared reads (runs
// list, artifacts, voice) the pages rely on.
//
// The observer keeps its own full client for the observation lane; this file
// deliberately carries only the continuum families (2026-07-12 split).

export type ReportInboxItem = {
  report_type: "bug" | "feature";
  filename: string;
  relpath: string;
  title: string;
  created_at?: string;
  session_id?: string;
  workflow_id?: string;
  active_run_id?: string;
  decision_id?: string;
  triage_status?: string;
};

export type ReportInboxListResponse = { items: ReportInboxItem[] };

export type ReportContentResponse = {
  report_type: "bug" | "feature";
  filename: string;
  relpath: string;
  content: string;
};

export type EmailAccountInfo = {
  account: string;
  email?: string;
  from_email?: string | null;
  can_read?: boolean;
  can_send?: boolean;
  imap_password_set?: boolean | null;
  smtp_password_set?: boolean | null;
};

export type EmailAccountsResponse = {
  ok: boolean;
  source?: string;
  config_path?: string;
  default_account?: string;
  accounts: EmailAccountInfo[];
};

export type EmailMessageSummary = {
  uid: string;
  message_id?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  flags?: string[];
  seen?: boolean;
  size?: number | null;
};

export type EmailListFilter = { since?: string | null; status?: string; limit?: number };

export type EmailListCounts = { returned?: number; unread?: number; read?: number };

export type EmailListResponse = {
  ok: boolean;
  account: string;
  mailbox: string;
  filter: EmailListFilter;
  counts: EmailListCounts;
  messages: EmailMessageSummary[];
};

export type EmailAttachmentInfo = { filename?: string; content_type?: string };

export type EmailReadResponse = {
  ok: boolean;
  account: string;
  mailbox: string;
  uid: string;
  message_id?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  flags?: string[];
  seen?: boolean;
  body_text?: string;
  body_html?: string;
  attachments?: EmailAttachmentInfo[];
};

export type EmailSendRequest = {
  account?: string;
  to: string | string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
  headers?: Record<string, string> | null;
};

export type EmailSmtpInfo = { host?: string; port?: number; username?: string; starttls?: boolean };

export type EmailSendResponse = {
  ok: boolean;
  account: string;
  message_id?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  smtp?: EmailSmtpInfo;
};

export type TriageDecisionSummary = {
  decision_id: string;
  report_type: "bug" | "feature";
  report_relpath: string;
  status: "pending" | "approved" | "deferred" | "rejected" | string;
  created_at?: string;
  updated_at?: string;
  defer_until?: string;
  missing_fields?: string[];
  duplicates?: Array<{ kind?: string; ref?: string; score?: number; title?: string }>;
  draft_relpath?: string;
};

export type TriageDecisionListResponse = { decisions: TriageDecisionSummary[] };

export type TriageRunResponse = {
  ok: boolean;
  reports: number;
  updated_decisions: number;
  decisions_dir: string;
  drafts_written: string[];
};

export type BacklogItemSummary = {
  kind: "planned" | "completed" | "proposed" | "recurrent" | "deprecated" | "trash";
  filename: string;
  item_id: number;
  package: string;
  title: string;
  task_type?: "bug" | "feature" | "task" | string;
  summary?: string;
  parsed?: boolean;
  /** List-level metadata (gateways ≥ 2026-07-12, commons c1090): parsed
   *  from the "> Priority:" / "> Labels:" header lines at list time.
   *  Absent keys = older gateway (#FALLBACK to client-side parsing). */
  priority?: "P0" | "P1" | "P2" | "P3" | "" | string;
  labels?: string[];
};

export type BacklogListResponse = { items: BacklogItemSummary[] };

export type BacklogContentResponse = { kind: string; filename: string; content: string };

export type BacklogTemplateResponse = { ok: boolean; relpath: string; sha256: string; content: string };

export type BacklogMoveResponse = {
  ok: boolean;
  from_kind: string;
  to_kind: string;
  filename: string;
  from_relpath: string;
  to_relpath: string;
};

export type BacklogUpdateResponse = { ok: boolean; kind: string; filename: string; sha256: string; bytes_written: number };

export type BacklogCreateResponse = { ok: boolean; kind: string; filename: string; relpath: string; item_id: number; sha256: string };

export type BacklogExecuteResponse = { ok: boolean; request_id: string; request_relpath: string; prompt: string };

export type BacklogRef = { kind: string; filename: string };

export type BacklogMergeResponse = {
  ok: boolean;
  kind: string;
  filename: string;
  relpath: string;
  item_id: number;
  sha256: string;
  merged_relpaths?: string[];
};

export type BacklogAssistResponse = { ok: boolean; reply: string; draft_markdown: string };

export type BacklogMaintainResponse = { ok: boolean; reply: string; draft_markdown: string };

export type BacklogAdvisorResponse = { ok: boolean; reply: string; run_id?: string | null; tool_trace?: any[] | null };

export type BacklogExecConfigResponse = {
  ok: boolean;
  runner_enabled: boolean;
  runner_alive?: boolean;
  runner_error?: string | null;
  can_execute: boolean;
  executor: string;
  notify?: boolean;
  codex_bin?: string | null;
  codex_model?: string | null;
  codex_reasoning_effort?: string | null;
  codex_available?: boolean | null;
};

export type BacklogExecRequestSummary = {
  request_id: string;
  status: string;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  backlog_relpath?: string | null;
  backlog_kind?: string | null;
  backlog_filename?: string | null;
  target_agent?: string | null;
  target_model?: string | null;
  target_reasoning_effort?: string | null;
  executor_type?: string | null;
  ok?: boolean | null;
  exit_code?: number | null;
  error?: string | null;
  run_dir_relpath?: string | null;
  last_message?: string | null;
};

export type BacklogExecRequestListResponse = { ok: boolean; requests: BacklogExecRequestSummary[] };

export type BacklogExecRequestDetailResponse = { ok: boolean; request_id: string; payload: any };

export type BacklogExecLogTailResponse = {
  ok: boolean;
  request_id: string;
  name: string;
  bytes: number;
  truncated: boolean;
  content: string;
  /** Cursor-follow fields (gateways with after_bytes support, 2026-07-12). */
  next_offset?: number;
  /** True when the requested after_bytes is past EOF (log rotated) — restart from a fresh window. */
  reset?: boolean;
};

export type BacklogExecActiveItem = { request_id: string; status: string; kind: string; filename: string; relpath: string };

export type BacklogExecActiveItemsResponse = { ok: boolean; items: BacklogExecActiveItem[] };

export type BacklogAttachmentStored = { filename: string; relpath: string; bytes: number; sha256: string };

export type BacklogAttachmentUploadResponse = { ok: boolean; kind: string; filename: string; item_id: number; stored: BacklogAttachmentStored };

export type AttachmentRef = {
  $artifact: string;
  [k: string]: any;
};

export type ManagedProcessInfo = {
  id: string;
  label: string;
  kind: string;
  description?: string | null;
  cwd?: string | null;
  command?: string[];
  url?: string | null;
  status?: string;
  pid?: number | null;
  started_at?: string | null;
  stopped_at?: string | null;
  exit_code?: number | null;
  log_relpath?: string | null;
  last_error?: string | null;
  actions?: string[];
};

export type ProcessListResponse = { ok: boolean; enabled: boolean; processes: ManagedProcessInfo[] };

// ---------------------------------------------------- discovery + entities

/** One provider from GET /discovery/providers (shape owned by the gateway;
 *  fields beyond these render as-is or not at all). */
export type DiscoveryProviderInfo = {
  name: string;
  display_name?: string;
  type?: string;
  status?: string;
  local_provider?: boolean;
  authentication_required?: boolean;
  description?: string;
};

export type DiscoveryProvidersResponse = { items: DiscoveryProviderInfo[] };

export type DiscoveryProviderModelsResponse = { provider: string; models: string[] };

/** One summoned entity from GET /entities (gateway entity registry). */
export type EntitySummary = {
  entity_id: string;
  name: string;
  slug: string;
  /** Gateway-labeled corruption/collision rows (unreadable manifest,
   *  moved-home collision): "LABELED, never listed as healthy and never
   *  hidden" — render as danger, never as a healthy card (adversary
   *  find: the label was being dropped). */
  error?: string;
  home_id?: string;
  created_at?: string;
  spark_version?: number;
  spark_hash?: string;
  handle?: string | null;
  files?: { spark?: boolean; memory?: boolean; book?: boolean };
  state?: { state?: string; changed_at?: string; reason?: string; written_by?: string; liveness?: string } | null;
  /** Serve-derived operator axis (decision:entity-liveness-axis v3, gateway
   *  c2149): `alive|stopped`, derived at serve time (paused ⇒ stopped).
   *  Feature-detected — render when present, NEVER client-derived. */
  liveness?: string;
};

export type EntityListResponse = { entities: EntitySummary[] };

// ---------------------------------------------------------- admin config
// Contract from the gateway seat (commons c1554; implementation lands on
// their next cycle). The `source` field names which rung of the
// stored > env > default resolution chain won — load-bearing after the
// 2026-07-13 incident where a launcher restart silently lost an env knob.

export type AdminConfigSource = "stored" | "env" | "default" | string;

/** One config knob as SERVED (live wire 2026-07-13: `{value, source}`;
 *  the c1554 draft spelled per-knob fields `enabled`/`path`/`id` — accept
 *  both so a doc-shaped gateway still renders). Non-admin reads may
 *  redact a path value to `{configured, source}` (c1569). */
export type AdminConfigKnob = {
  value?: boolean | string | null;
  enabled?: boolean;
  path?: string | null;
  id?: string;
  configured?: boolean;
  source: AdminConfigSource;
};

export function knob_bool(knob?: AdminConfigKnob): boolean | null {
  if (!knob) return null;
  if (knob.value !== undefined && knob.value !== null) return Boolean(knob.value);
  if (knob.enabled !== undefined) return Boolean(knob.enabled);
  if (knob.configured !== undefined) return Boolean(knob.configured);
  if (knob.path !== undefined) return Boolean(knob.path);
  return null;
}

export function knob_string(knob?: AdminConfigKnob): string {
  if (!knob) return "";
  const v = knob.value !== undefined && knob.value !== null ? knob.value : (knob.id ?? knob.path ?? "");
  return typeof v === "string" ? v.trim() : "";
}

export type AdminRuntimeConfigResponse = {
  process_manager?: AdminConfigKnob;
  triage_repo_root?: AdminConfigKnob;
  backlog_exec_runner?: AdminConfigKnob;
  executor?: AdminConfigKnob;
  /** The live GET embeds the executor registry too. */
  executors?: AdminExecutorInfo[];
  /** Principal-resolved admin authority (c1563 amendment, folded c1569):
   *  false = render posture read-only, never a doomed write control. */
  writable?: boolean;
};

/** One registered data home (GET /admin/data-homes; live shape 2026-07-14).
 *  Read-only telemetry here — purge verbs stay on the gateway console per
 *  decision:cache-management-split. */
export type DataHomeRow = {
  name: string;
  path: string;
  kind: string;
  owner: string;
  safe_to_purge: boolean;
  description?: string;
  exists?: boolean;
  size_bytes?: number;
};

export type DataHomesResponse = { homes: DataHomeRow[]; warnings?: string[] };

export type AdminExecutorInfo = {
  id: string;
  display?: string;
  available?: boolean;
  default?: boolean;
  models?: string[];
};

export type AdminExecutorsResponse = AdminExecutorInfo[] | { executors: AdminExecutorInfo[] };

export type ProcessActionResponse = { ok: boolean; process_id: string; state: any };

export type ProcessLogTailResponse = {
  ok: boolean;
  process_id: string;
  bytes: number;
  truncated: boolean;
  log_relpath?: string | null;
  content: string;
};

export type ManagedEnvVarItem = {
  key: string;
  label: string;
  description: string;
  category?: string;
  secret?: boolean;
  is_set?: boolean;
  source?: string;
  updated_at?: string | null;
};

export type ManagedEnvVarListResponse = {
  ok: boolean;
  enabled: boolean;
  error?: string | null;
  vars: ManagedEnvVarItem[];
};
