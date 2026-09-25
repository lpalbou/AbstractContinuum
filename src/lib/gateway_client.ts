// Typed client for the gateway API families AbstractContinuum uses.
//
// Scope (2026-07-12 observer split): this client carries the DEVELOPMENT
// lane — backlog CRUD + the exec pipeline, report/email inbox + triage, and
// managed process control — plus the few shared reads the pages need:
// list_runs (connection probe), run artifact download (exec log artifacts),
// attachment upload + audio transcribe + TTS (voice input in the advisor).
// The observer app keeps the full observation-lane client; do not grow
// observation families here.
//
// Transport: same-origin by default. bin/cli.js proxies /api/* to the
// gateway with server-held session cookies (@abstractframework/app-server,
// appId "abstractcontinuum"); mutating requests must echo the CSRF token
// from the abstractcontinuum_gateway_csrf cookie. A non-empty base_url +
// bearer token switches to direct mode (dev against a bare gateway).

import type {
  AdminExecutorsResponse,
  AdminRuntimeConfigResponse,
  AttachmentRef,
  BacklogAdvisorResponse,
  BacklogAssistResponse,
  BacklogAttachmentUploadResponse,
  BacklogContentResponse,
  BacklogCreateResponse,
  BacklogExecActiveItemsResponse,
  BacklogExecConfigResponse,
  BacklogExecLogTailResponse,
  BacklogExecRequestDetailResponse,
  BacklogExecRequestListResponse,
  BacklogExecuteResponse,
  BacklogListResponse,
  BacklogMaintainResponse,
  BacklogMergeResponse,
  BacklogMoveResponse,
  BacklogRef,
  BacklogStatusResponse,
  BacklogTemplateResponse,
  BacklogUpdateResponse,
  DataHomesResponse,
  DiscoveryProviderModelsResponse,
  DiscoveryProvidersResponse,
  EmailAccountsResponse,
  EmailListResponse,
  EmailReadResponse,
  EmailSendRequest,
  EmailSendResponse,
  EntityListResponse,
  ManagedEnvVarListResponse,
  ProcessActionResponse,
  ProcessListResponse,
  ProcessLogTailResponse,
  ReportContentResponse,
  ReportInboxListResponse,
  TriageDecisionListResponse,
  TriageDecisionSummary,
  TriageRunResponse,
} from "./gateway_types";

export type { AttachmentRef } from "./gateway_types";
export * from "./gateway_types";

export type GatewayClientConfig = {
  base_url: string; // e.g. "http://localhost:8080" (no trailing slash) or "" for same-origin
  auth_token?: string;
};

const CSRF_COOKIE = "abstractcontinuum_gateway_csrf";
const APP_CSRF_HEADER = "x-abstractcontinuum-csrf";
// The session proxy also accepts the canonical header; send both so a
// reverse proxy in front of several Abstract apps can standardize on one.
const CANONICAL_CSRF_HEADER = "x-abstract-csrf";

function _join(base_url: string, path: string): string {
  const base = (base_url || "").trim().replace(/\/+$/, "");
  if (!base) return path;
  return `${base}${path}`;
}

function _auth_headers(token?: string): Record<string, string> {
  const t = (token || "").trim();
  const out: Record<string, string> = {};
  if (t) out.Authorization = `Bearer ${t}`;
  try {
    const csrf = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CSRF_COOKIE}=`))
      ?.slice(`${CSRF_COOKIE}=`.length);
    if (csrf) {
      const decoded = decodeURIComponent(csrf);
      out[APP_CSRF_HEADER] = decoded;
      out[CANONICAL_CSRF_HEADER] = decoded;
    }
  } catch {
    // non-browser tests
  }
  return out;
}

/** Shared TTS synthesis fields (voice override, dm 130): provider / model
 *  / profile (base voice) / voice (cloned selector) / quality_preset —
 *  each included only when non-empty so the gateway default applies for
 *  every omitted field. One builder for the blocking and streaming lanes. */
function voice_synthesis_body(req: { provider?: string; model?: string; profile?: string; voice?: string; quality_preset?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: unknown) => {
    const s = String(v || "").trim();
    if (s) out[k] = s;
  };
  add("provider", req?.provider);
  add("model", req?.model);
  add("profile", req?.profile);
  add("voice", req?.voice);
  add("quality_preset", req?.quality_preset);
  return out;
}

async function _read_error(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text?.trim() ? text.trim() : `${resp.status}`;
  } catch {
    return `${resp.status}`;
  }
}

/**
 * Error carrying the HTTP status and the parsed JSON body (when the body
 * was JSON). Callers that consume structured refusals — e.g. the DoR
 * gate's 409 {"error":"definition_of_ready_failed","checks":[...]} —
 * inspect `body`; message keeps the historical "<label> failed: <text>"
 * shape for everyone else.
 */
export class GatewayRequestError extends Error {
  readonly status: number;
  readonly body: any;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "GatewayRequestError";
    this.status = status;
    this.body = body;
  }
}

// 429 auth-lockout courtesy (incident 2026-07-15, flow's c2343 forensics):
// the gateway's lockout keys on client IP, so EVERY localhost app shares
// ONE bucket — a poller that keeps hammering during a lockout keeps the
// window warm for every other app. Standing down on 429 is a good-citizen
// requirement, not an optimization (observer shipped the same shape). The
// ladder matches observer's so the fleet backs off in lockstep.
const BACKOFF_LADDER_S = [15, 30, 60, 120];

export class GatewayClient {
  private _cfg: GatewayClientConfig;
  /** Epoch ms until which automated pollers should stand down (0 = clear). */
  private _backoff_until = 0;
  /** Position on the backoff ladder; advances per consecutive 429, resets
   *  to 0 on the first success. */
  private _backoff_step = 0;

  constructor(cfg: GatewayClientConfig) {
    this._cfg = { ...cfg, base_url: (cfg.base_url || "").trim() };
  }

  /** True while the shared IP is (or was just) rate-limited — pollers check
   *  this before their tick and skip it, so continuum stops feeding a lock
   *  that starves the other apps on the machine. Explicit user actions do
   *  NOT check this (they are low-frequency and the user expects a try). */
  is_backing_off(): boolean {
    return Date.now() < this._backoff_until;
  }

  /** Epoch ms the current stand-down clears (0 when not backing off) — lets
   *  the UI render an honest "locked until" instead of a spinner. */
  backoff_until(): number {
    return this.is_backing_off() ? this._backoff_until : 0;
  }

  // ---------------------------------------------------------------- transport

  private async _fetch(label: string, path: string, init?: RequestInit): Promise<Response> {
    const r = await fetch(_join(this._cfg.base_url, path), {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ..._auth_headers(this._cfg.auth_token),
      },
    });
    if (r.ok) {
      // First success clears the stand-down (observer's "reset on first
      // success" — the lock cooled, resume normal cadence).
      this._backoff_step = 0;
      this._backoff_until = 0;
      return r;
    }
    const text = await _read_error(r);
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      // non-JSON error body — message-only error below
    }
    // Human-readable message: unwrap FastAPI's {"detail": "..."} so error
    // banners show the operator-written detail, not raw JSON wrapping.
    let message = text;
    if (body && typeof body === "object" && body.detail !== undefined) {
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    }
    // 429 (or a lockout message on any status): open/extend the stand-down
    // window. A 429 never records a gateway-side failure (flow c2343: the
    // lockout check runs before token verification), so continuing to poll
    // cannot itself deepen the lock — but it keeps the window warm, which is
    // exactly what starves the fleet. Go quiet.
    const is_lockout = r.status === 429 || /too many requests|auth lockout|locked/i.test(message);
    if (is_lockout) {
      const secs = BACKOFF_LADDER_S[Math.min(this._backoff_step, BACKOFF_LADDER_S.length - 1)];
      this._backoff_until = Date.now() + secs * 1000;
      if (this._backoff_step < BACKOFF_LADDER_S.length - 1) this._backoff_step += 1;
    }
    throw new GatewayRequestError(`${label} failed: ${message}`, r.status, body);
  }

  private async _get_json<T = any>(label: string, path: string): Promise<T> {
    const r = await this._fetch(label, path);
    return (await r.json()) as T;
  }

  private async _post_json<T = any>(label: string, path: string, body?: any): Promise<T> {
    const r = await this._fetch(label, path, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await r.json()) as T;
  }

  private async _post_form<T = any>(label: string, path: string, form: FormData): Promise<T> {
    const r = await this._fetch(label, path, { method: "POST", body: form });
    return (await r.json()) as T;
  }

  // ------------------------------------------------------------- shared reads

  /** Bounded run list; the app uses `{ limit: 1 }` as its authenticated reachability probe. */
  async list_runs(opts?: { limit?: number; status?: string; session_id?: string; root_only?: boolean }): Promise<any> {
    const qs = new URLSearchParams();
    qs.set("limit", String(typeof opts?.limit === "number" ? opts.limit : 50));
    const status = String(opts?.status || "").trim();
    if (status) qs.set("status", status);
    const session_id = String(opts?.session_id || "").trim();
    if (session_id) qs.set("session_id", session_id);
    if (opts?.root_only === true) qs.set("root_only", "true");
    return await this._get_json("list_runs", `/api/gateway/runs?${qs.toString()}`);
  }

  /** Download one run artifact's bytes (exec log artifacts, TTS audio). */
  async download_run_artifact_content(run_id: string, artifact_id: string, opts?: { access?: "content" | "preview" | "download" | string }): Promise<Blob> {
    const rid = String(run_id || "").trim();
    const aid = String(artifact_id || "").trim();
    if (!rid) throw new Error("download_run_artifact_content: run_id is required");
    if (!aid) throw new Error("download_run_artifact_content: artifact_id is required");
    const access = String(opts?.access || "").trim();
    const qs = access ? `?access=${encodeURIComponent(access)}` : "";
    const r = await this._fetch(
      "download_run_artifact_content",
      `/api/gateway/runs/${encodeURIComponent(rid)}/artifacts/${encodeURIComponent(aid)}/content${qs}`
    );
    return await r.blob();
  }

  // ------------------------------------------------------- voice (advisor UX)

  async attachments_upload(session_id: string, file: File, opts?: { filename?: string; content_type?: string }): Promise<AttachmentRef> {
    const sid = String(session_id || "").trim();
    if (!sid) throw new Error("attachments_upload: session_id is required");
    if (!file) throw new Error("attachments_upload: file is required");

    const filename = String(opts?.filename || "").trim() || String((file as any)?.name || "").trim() || "upload.bin";
    const content_type = String(opts?.content_type || "").trim() || String((file as any)?.type || "").trim();

    const form = new FormData();
    form.append("session_id", sid);
    form.append("file", file, filename);
    if (filename) form.append("filename", filename);
    if (content_type) form.append("content_type", content_type);

    const body = await this._post_form("attachments_upload", "/api/gateway/attachments/upload", form);
    const attachment = body?.attachment;
    if (!attachment || typeof attachment !== "object") throw new Error("attachments_upload: missing attachment");
    const aid = String((attachment as any).$artifact || "").trim();
    if (!aid) throw new Error("attachments_upload: missing attachment.$artifact");
    return attachment as AttachmentRef;
  }

  async audio_transcribe(
    run_id: string,
    req: { audio_artifact: AttachmentRef; language?: string; request_id?: string }
  ): Promise<{ ok: boolean; run_id: string; request_id: string; text: string; transcript_artifact: any }> {
    const rid = String(run_id || "").trim();
    if (!rid) throw new Error("audio_transcribe: run_id is required");
    const audio_artifact = req?.audio_artifact;
    if (!audio_artifact || typeof audio_artifact !== "object") throw new Error("audio_transcribe: audio_artifact is required");
    const aid = String((audio_artifact as any).$artifact || "").trim();
    if (!aid) throw new Error("audio_transcribe: audio_artifact.$artifact is required");

    const body: any = { audio_artifact };
    const lang = String(req?.language || "").trim();
    if (lang) body.language = lang;
    const req_id = String(req?.request_id || "").trim();
    if (req_id) body.request_id = req_id;

    const out: any = await this._post_json("audio_transcribe", `/api/gateway/runs/${encodeURIComponent(rid)}/audio/transcribe`, body);
    return {
      ok: Boolean(out?.ok),
      run_id: String(out?.run_id || ""),
      request_id: String(out?.request_id || ""),
      text: String(out?.text || ""),
      transcript_artifact: out?.transcript_artifact,
    };
  }

  async voice_tts(
    run_id: string,
    req: { text: string; provider?: string; model?: string; profile?: string; voice?: string; quality_preset?: string; format?: string; timeout_s?: number; request_id?: string }
  ): Promise<{ ok: boolean; run_id: string; request_id: string; audio_artifact: any }> {
    const rid = String(run_id || "").trim();
    if (!rid) throw new Error("voice_tts: run_id is required");
    const text = String(req?.text || "").trim();
    if (!text) throw new Error("voice_tts: text is required");

    const body: any = { text, ...voice_synthesis_body(req) };
    const fmt = String(req?.format || "").trim();
    if (fmt) body.format = fmt;
    if (typeof req?.timeout_s === "number" && req.timeout_s > 0) body.timeout_s = req.timeout_s;
    const req_id = String(req?.request_id || "").trim();
    if (req_id) body.request_id = req_id;

    const out: any = await this._post_json("voice_tts", `/api/gateway/runs/${encodeURIComponent(rid)}/voice/tts`, body);
    return {
      ok: Boolean(out?.ok),
      run_id: String(out?.run_id || ""),
      request_id: String(out?.request_id || ""),
      audio_artifact: out?.audio_artifact,
    };
  }

  /** Execution-host capability routing defaults (gateway GET
   *  /config/capability-defaults): the operator's CONFIGURED default
   *  provider/model/voice per capability route (output.voice, output.text,
   *  …). The console reads output.voice[.tts] so a "read aloud" request
   *  names the operator's configured engine EXPLICITLY — a bare request
   *  falls through to abstractvoice's hardcoded openai default (operator
   *  incident dm 133: it 429'd on openai instead of his supertonic).
   *  Returns the raw payload ({routes:[{key,configured,provider,model,
   *  options}]}); the caller resolves the row. Never throws through —
   *  callers degrade to "gateway resolves it" when unavailable. */
  async capability_defaults(): Promise<any> {
    return await this._get_json("capability_defaults", "/api/gateway/config/capability-defaults");
  }

  /** TTS voice catalog (gateway GET /voice/voices, hub-side discovery): the
   *  providers/models/voices — cloned voices included — that a voice
   *  override picker offers. Compact by default (normalized items, no
   *  duplicated source trees). Returns the raw payload; the caller reads
   *  the fields it needs. 404/unavailable is the caller's to degrade. */
  async voice_voices(opts?: { provider?: string; model?: string; providers_only?: boolean }): Promise<any> {
    const qs = new URLSearchParams({ compact: "true" });
    const p = String(opts?.provider || "").trim();
    const m = String(opts?.model || "").trim();
    if (p) qs.set("provider", p);
    if (m) qs.set("model", m);
    if (opts?.providers_only) qs.set("providers_only", "true");
    return await this._get_json("voice_voices", `/api/gateway/voice/voices?${qs.toString()}`);
  }

  /** Transport parameters for the kit's streamTtsJsonl over the gateway
   *  streaming TTS endpoint (operator dm 130: message playback starts on
   *  the first synthesized segment). Returns the RESOLVED path + headers
   *  (auth bearer + CSRF) so the CSRF/base-url logic stays in ONE place —
   *  the Team page just hands the result to streamTtsJsonl. */
  voice_stream_transport(
    run_id: string,
    req: { text: string; provider?: string; model?: string; profile?: string; voice?: string; quality_preset?: string }
  ): { path: string; body: Record<string, unknown>; headers: Record<string, string> } {
    const rid = String(run_id || "").trim();
    if (!rid) throw new Error("voice_stream_transport: run_id is required");
    return {
      path: _join(this._cfg.base_url, `/api/gateway/runs/${encodeURIComponent(rid)}/voice/tts/stream`),
      body: { text: String(req?.text || ""), format: "wav", ...voice_synthesis_body(req) },
      headers: _auth_headers(this._cfg.auth_token),
    };
  }

  // ---------------------------------------------------------- report inbox

  async list_bug_reports(): Promise<ReportInboxListResponse> {
    return await this._get_json("list_bug_reports", "/api/gateway/reports/bugs");
  }

  async list_feature_requests(): Promise<ReportInboxListResponse> {
    return await this._get_json("list_feature_requests", "/api/gateway/reports/features");
  }

  async get_bug_report_content(filename: string): Promise<ReportContentResponse> {
    const name = String(filename || "").trim();
    if (!name) throw new Error("get_bug_report_content: filename is required");
    return await this._get_json("get_bug_report_content", `/api/gateway/reports/bugs/${encodeURIComponent(name)}/content`);
  }

  async get_feature_request_content(filename: string): Promise<ReportContentResponse> {
    const name = String(filename || "").trim();
    if (!name) throw new Error("get_feature_request_content: filename is required");
    return await this._get_json("get_feature_request_content", `/api/gateway/reports/features/${encodeURIComponent(name)}/content`);
  }

  async bug_report_create(req: {
    session_id: string;
    description: string;
    active_run_id?: string | null;
    workflow_id?: string | null;
    client?: string | null;
    client_version?: string | null;
    user_agent?: string | null;
    url?: string | null;
    provider?: string | null;
    model?: string | null;
    template?: string | null;
    context?: any;
  }): Promise<any> {
    return await this._post_json("bug_report_create", "/api/gateway/bugs/report", _report_create_body(req, "bug_report_create"));
  }

  async feature_report_create(req: {
    session_id: string;
    description: string;
    active_run_id?: string | null;
    workflow_id?: string | null;
    client?: string | null;
    client_version?: string | null;
    user_agent?: string | null;
    url?: string | null;
    provider?: string | null;
    model?: string | null;
    template?: string | null;
    context?: any;
  }): Promise<any> {
    return await this._post_json("feature_report_create", "/api/gateway/features/report", _report_create_body(req, "feature_report_create"));
  }

  // ------------------------------------------------------------------- email

  async email_list_accounts(): Promise<EmailAccountsResponse> {
    return await this._get_json("email_list_accounts", "/api/gateway/email/accounts");
  }

  async email_list_messages(opts?: {
    account?: string;
    mailbox?: string;
    since?: string;
    status?: "all" | "unread" | "read" | string;
    limit?: number;
  }): Promise<EmailListResponse> {
    const qs = new URLSearchParams();
    const account = String(opts?.account || "").trim();
    if (account) qs.set("account", account);
    const mailbox = String(opts?.mailbox || "").trim();
    if (mailbox) qs.set("mailbox", mailbox);
    const since = String(opts?.since || "").trim();
    if (since) qs.set("since", since);
    const status = String(opts?.status || "").trim();
    if (status) qs.set("status", status);
    qs.set("limit", String(typeof opts?.limit === "number" && Number.isFinite(opts.limit) ? Number(opts.limit) : 20));
    return await this._get_json("email_list_messages", `/api/gateway/email/messages?${qs.toString()}`);
  }

  async email_read_message(uid: string, opts?: { account?: string; mailbox?: string; max_body_chars?: number }): Promise<EmailReadResponse> {
    const id = String(uid || "").trim();
    if (!id) throw new Error("email_read_message: uid is required");
    const qs = new URLSearchParams();
    const account = String(opts?.account || "").trim();
    if (account) qs.set("account", account);
    const mailbox = String(opts?.mailbox || "").trim();
    if (mailbox) qs.set("mailbox", mailbox);
    const max_body_chars = typeof opts?.max_body_chars === "number" && Number.isFinite(opts.max_body_chars) ? Number(opts.max_body_chars) : 20000;
    qs.set("max_body_chars", String(max_body_chars));
    return await this._get_json("email_read_message", `/api/gateway/email/messages/${encodeURIComponent(id)}?${qs.toString()}`);
  }

  async email_send(req: EmailSendRequest): Promise<EmailSendResponse> {
    const subject = String(req?.subject || "").trim();
    if (!subject) throw new Error("email_send: subject is required");
    return await this._post_json("email_send", "/api/gateway/email/send", req || {});
  }

  // ------------------------------------------------------------------ triage

  async triage_run(opts?: { write_drafts?: boolean; enable_llm?: boolean }): Promise<TriageRunResponse> {
    const body: any = {};
    if (typeof opts?.write_drafts === "boolean") body.write_drafts = Boolean(opts.write_drafts);
    if (typeof opts?.enable_llm === "boolean") body.enable_llm = Boolean(opts.enable_llm);
    return await this._post_json("triage_run", "/api/gateway/triage/run", body);
  }

  async list_triage_decisions(opts?: { status?: string; limit?: number }): Promise<TriageDecisionListResponse> {
    const qs = new URLSearchParams();
    const status = String(opts?.status || "").trim();
    if (status) qs.set("status", status);
    qs.set("limit", String(typeof opts?.limit === "number" && Number.isFinite(opts.limit) ? Number(opts.limit) : 200));
    return await this._get_json("list_triage_decisions", `/api/gateway/triage/decisions?${qs.toString()}`);
  }

  async apply_triage_decision(
    decision_id: string,
    args: { action: "approve" | "reject" | "defer"; defer_days?: number | null }
  ): Promise<TriageDecisionSummary> {
    const did = String(decision_id || "").trim();
    if (!did) throw new Error("apply_triage_decision: decision_id is required");
    const action = String(args?.action || "").trim();
    if (!action) throw new Error("apply_triage_decision: action is required");
    const body: any = { action };
    if (action === "defer") {
      const d = args?.defer_days;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) body.defer_days = Number(d);
    }
    return await this._post_json("apply_triage_decision", `/api/gateway/triage/decisions/${encodeURIComponent(did)}/apply`, body);
  }

  // ------------------------------------------------------------ backlog CRUD

  async backlog_list(kind: "planned" | "completed" | "proposed" | "recurrent" | "deprecated" | "trash"): Promise<BacklogListResponse> {
    const k = String(kind || "").trim();
    if (!k) throw new Error("backlog_list: kind is required");
    return await this._get_json("backlog_list", `/api/gateway/backlog/${encodeURIComponent(k)}`);
  }

  async backlog_content(
    kind: "planned" | "completed" | "proposed" | "recurrent" | "deprecated" | "trash",
    filename: string
  ): Promise<BacklogContentResponse> {
    const k = String(kind || "").trim();
    const name = String(filename || "").trim();
    if (!k) throw new Error("backlog_content: kind is required");
    if (!name) throw new Error("backlog_content: filename is required");
    return await this._get_json("backlog_content", `/api/gateway/backlog/${encodeURIComponent(k)}/${encodeURIComponent(name)}/content`);
  }

  async backlog_template(): Promise<BacklogTemplateResponse> {
    return await this._get_json("backlog_template", "/api/gateway/backlog/template");
  }

  /** Backlog folder posture (gateway mission II). A 404 means the gateway
   *  predates the endpoint — callers fall back to the 404-detail class. */
  async backlog_status(): Promise<BacklogStatusResponse> {
    return await this._get_json("backlog_status", "/api/gateway/backlog/status");
  }

  async backlog_move(args: { from_kind: string; to_kind: string; filename: string }): Promise<BacklogMoveResponse> {
    const from_kind = String(args?.from_kind || "").trim();
    const to_kind = String(args?.to_kind || "").trim();
    const filename = String(args?.filename || "").trim();
    if (!from_kind) throw new Error("backlog_move: from_kind is required");
    if (!to_kind) throw new Error("backlog_move: to_kind is required");
    if (!filename) throw new Error("backlog_move: filename is required");
    return await this._post_json("backlog_move", "/api/gateway/backlog/move", { from_kind, to_kind, filename });
  }

  async backlog_update(args: { kind: string; filename: string; content: string; expected_sha256?: string | null }): Promise<BacklogUpdateResponse> {
    const kind = String(args?.kind || "").trim();
    const filename = String(args?.filename || "").trim();
    if (!kind) throw new Error("backlog_update: kind is required");
    if (!filename) throw new Error("backlog_update: filename is required");
    const body: any = { content: String(args?.content ?? "") };
    const expected_sha256 = String(args?.expected_sha256 || "").trim();
    if (expected_sha256) body.expected_sha256 = expected_sha256;
    return await this._post_json(
      "backlog_update",
      `/api/gateway/backlog/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}/update`,
      body
    );
  }

  async backlog_create(args: {
    kind: string;
    package: string;
    title: string;
    task_type?: string | null;
    summary?: string | null;
    content?: string | null;
  }): Promise<BacklogCreateResponse> {
    const kind = String(args?.kind || "").trim();
    const pkg = String(args?.package || "").trim();
    const title = String(args?.title || "").trim();
    if (!kind) throw new Error("backlog_create: kind is required");
    if (!pkg) throw new Error("backlog_create: package is required");
    if (!title) throw new Error("backlog_create: title is required");
    const body: any = { kind, package: pkg, title };
    const task_type = String(args?.task_type || "").trim();
    if (task_type) body.task_type = task_type;
    const summary = String(args?.summary || "").trim();
    if (summary) body.summary = summary;
    const content = args?.content == null ? "" : String(args?.content ?? "");
    if (content.trim()) body.content = content;
    return await this._post_json("backlog_create", "/api/gateway/backlog/create", body);
  }

  async backlog_merge(args: {
    kind: string;
    package: string;
    title: string;
    task_type?: string | null;
    summary?: string | null;
    items: BacklogRef[];
  }): Promise<BacklogMergeResponse> {
    const kind = String(args?.kind || "").trim();
    const pkg = String(args?.package || "").trim();
    const title = String(args?.title || "").trim();
    const items = Array.isArray(args?.items) ? (args.items as any[]) : [];
    if (!kind) throw new Error("backlog_merge: kind is required");
    if (!pkg) throw new Error("backlog_merge: package is required");
    if (!title) throw new Error("backlog_merge: title is required");
    if (items.length < 2) throw new Error("backlog_merge: at least 2 items are required");
    const body: any = {
      kind,
      package: pkg,
      title,
      items: items.map((it) => ({ kind: String(it?.kind || "").trim(), filename: String(it?.filename || "").trim() })),
    };
    const task_type = String(args?.task_type || "").trim();
    if (task_type) body.task_type = task_type;
    const summary = String(args?.summary || "").trim();
    if (summary) body.summary = summary;
    return await this._post_json("backlog_merge", "/api/gateway/backlog/merge", body);
  }

  async backlog_upload_attachment(args: { kind: string; filename: string; file: File; overwrite?: boolean }): Promise<BacklogAttachmentUploadResponse> {
    const kind = String(args?.kind || "").trim();
    const filename = String(args?.filename || "").trim();
    const file = args?.file;
    if (!kind) throw new Error("backlog_upload_attachment: kind is required");
    if (!filename) throw new Error("backlog_upload_attachment: filename is required");
    if (!file) throw new Error("backlog_upload_attachment: file is required");
    const fd = new FormData();
    fd.set("overwrite", args?.overwrite === true ? "true" : "false");
    fd.set("file", file, file.name || "attachment");
    return await this._post_form(
      "backlog_upload_attachment",
      `/api/gateway/backlog/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}/attachments/upload`,
      fd
    );
  }

  // ------------------------------------------------------------ AI assistance

  async backlog_assist(args: {
    kind: string;
    package: string;
    title: string;
    summary?: string | null;
    draft_markdown?: string | null;
    messages: Array<{ role: string; content: string }>;
    provider?: string | null;
    model?: string | null;
    /** Reasoning effort on the `thinking` wire key (contract v1). HONEST
     *  LIMIT: the gateway's BacklogAssistRequest model does not declare
     *  this field yet — pydantic drops it silently until the additive
     *  field lands gateway-side (asked on the reasoning thread). */
    thinking?: string | null;
  }): Promise<BacklogAssistResponse> {
    const kind = String(args?.kind || "").trim();
    const pkg = String(args?.package || "").trim();
    const title = String(args?.title || "").trim();
    if (!kind) throw new Error("backlog_assist: kind is required");
    if (!pkg) throw new Error("backlog_assist: package is required");
    if (!title) throw new Error("backlog_assist: title is required");
    const body: any = { kind, package: pkg, title, messages: Array.isArray(args?.messages) ? args.messages : [] };
    const summary = String(args?.summary || "").trim();
    if (summary) body.summary = summary;
    const draft_markdown = args?.draft_markdown == null ? "" : String(args.draft_markdown ?? "");
    if (draft_markdown.trim()) body.draft_markdown = draft_markdown;
    const provider = String(args?.provider || "").trim();
    if (provider) body.provider = provider;
    const model = String(args?.model || "").trim();
    if (model) body.model = model;
    const thinking = String(args?.thinking || "").trim();
    if (thinking) body.thinking = thinking;
    return await this._post_json("backlog_assist", "/api/gateway/backlog/assist", body);
  }

  async backlog_maintain(args: {
    kind: string;
    filename: string;
    package: string;
    title: string;
    summary?: string | null;
    draft_markdown?: string | null;
    messages: Array<{ role: string; content: string }>;
    provider?: string | null;
    model?: string | null;
  }): Promise<BacklogMaintainResponse> {
    const kind = String(args?.kind || "").trim();
    const filename = String(args?.filename || "").trim();
    const pkg = String(args?.package || "").trim();
    const title = String(args?.title || "").trim();
    if (!kind) throw new Error("backlog_maintain: kind is required");
    if (!filename) throw new Error("backlog_maintain: filename is required");
    if (!pkg) throw new Error("backlog_maintain: package is required");
    if (!title) throw new Error("backlog_maintain: title is required");
    const body: any = { kind, filename, package: pkg, title, messages: Array.isArray(args?.messages) ? args.messages : [] };
    const summary = String(args?.summary || "").trim();
    if (summary) body.summary = summary;
    const draft_markdown = args?.draft_markdown == null ? "" : String(args.draft_markdown ?? "");
    if (draft_markdown.trim()) body.draft_markdown = draft_markdown;
    const provider = String(args?.provider || "").trim();
    if (provider) body.provider = provider;
    const model = String(args?.model || "").trim();
    if (model) body.model = model;
    return await this._post_json("backlog_maintain", "/api/gateway/backlog/maintain", body);
  }

  async backlog_advisor(args: {
    messages: Array<{ role: string; content: string }>;
    provider?: string | null;
    model?: string | null;
    /** Same honest limit as backlog_assist.thinking (see there). */
    thinking?: string | null;
    agent?: string | null;
    include_trace?: boolean;
    focus_kind?: string | null;
    focus_type?: string | null;
  }): Promise<BacklogAdvisorResponse> {
    const body: any = { messages: Array.isArray(args?.messages) ? args.messages : [] };
    const provider = String(args?.provider || "").trim();
    if (provider) body.provider = provider;
    const model = String(args?.model || "").trim();
    if (model) body.model = model;
    const thinking = String(args?.thinking || "").trim();
    if (thinking) body.thinking = thinking;
    const agent = String(args?.agent || "").trim();
    if (agent) body.agent = agent;
    if (args?.include_trace === true) body.include_trace = true;
    const focus_kind = String(args?.focus_kind || "").trim();
    if (focus_kind) body.focus_kind = focus_kind;
    const focus_type = String(args?.focus_type || "").trim();
    if (focus_type) body.focus_type = focus_type;
    return await this._post_json("backlog_advisor", "/api/gateway/backlog/advisor", body);
  }

  // ----------------------------------------------------------- exec pipeline

  async backlog_execute(args: {
    kind: string;
    filename: string;
    execution_mode?: string | null;
    /** Per-request execution agent (gateway c2194 point 5): canonical
     *  registry id (codex | claude | cursor-agent | abstractcode) sent as
     *  ?executor=<id>; unknown/unavailable picks refuse 400 VERBATIM
     *  pre-enqueue — render the refusal, nothing queued. */
    executor?: string | null;
    /** Agent override (gateway c1090 contract): validated server-side
     *  against ABSTRACTGATEWAY_BACKLOG_EXEC_ALLOWED_MODELS; refusals are
     *  operator-readable 403s — render them verbatim. */
    target_model?: string | null;
    target_reasoning_effort?: string | null;
    /** Server-side DoR gate (gateway c1140, to our c1124 contract):
     *  dor="check" refuses 409 {"error":"definition_of_ready_failed",
     *  "checks":[...]} unless override=true (recorded as dor_overridden
     *  on the queue payload). No dor param = gate not evaluated. */
    dor?: "check" | null;
    override?: boolean;
  }): Promise<BacklogExecuteResponse> {
    const kind = String(args?.kind || "").trim();
    const filename = String(args?.filename || "").trim();
    if (!kind) throw new Error("backlog_execute: kind is required");
    if (!filename) throw new Error("backlog_execute: filename is required");
    const qs = new URLSearchParams();
    const execution_mode = String(args?.execution_mode || "").trim();
    if (execution_mode) qs.set("execution_mode", execution_mode);
    const executor = String(args?.executor || "").trim();
    if (executor) qs.set("executor", executor);
    const target_model = String(args?.target_model || "").trim();
    if (target_model) qs.set("target_model", target_model);
    const target_reasoning_effort = String(args?.target_reasoning_effort || "").trim();
    if (target_reasoning_effort) qs.set("target_reasoning_effort", target_reasoning_effort);
    if (args?.dor === "check") qs.set("dor", "check");
    if (args?.override === true) qs.set("override", "true");
    const r = await this._fetch(
      "backlog_execute",
      `/api/gateway/backlog/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}/execute${qs.toString() ? `?${qs.toString()}` : ""}`,
      { method: "POST" }
    );
    return await r.json();
  }

  async backlog_execute_batch(args: {
    items: BacklogRef[];
    execution_mode?: string | null;
    /** Per-request execution agent (canonical registry id; see
     *  backlog_execute.executor). */
    executor?: string | null;
    target_model?: string | null;
    target_reasoning_effort?: string | null;
    dor?: "check" | null;
    override?: boolean;
  }): Promise<BacklogExecuteResponse> {
    const items = Array.isArray(args?.items) ? (args.items as any[]) : [];
    if (!items.length) throw new Error("backlog_execute_batch: items are required");
    const body: any = { items: items.map((it) => ({ kind: String(it?.kind || "").trim(), filename: String(it?.filename || "").trim() })) };
    const execution_mode = String(args?.execution_mode || "").trim();
    if (execution_mode) body.execution_mode = execution_mode;
    const executor = String(args?.executor || "").trim();
    if (executor) body.executor = executor;
    const target_model = String(args?.target_model || "").trim();
    if (target_model) body.target_model = target_model;
    const target_reasoning_effort = String(args?.target_reasoning_effort || "").trim();
    if (target_reasoning_effort) body.target_reasoning_effort = target_reasoning_effort;
    if (args?.dor === "check") body.dor = "check";
    if (args?.override === true) body.override = true;
    return await this._post_json("backlog_execute_batch", "/api/gateway/backlog/execute_batch", body);
  }

  async backlog_exec_config(): Promise<BacklogExecConfigResponse> {
    return await this._get_json("backlog_exec_config", "/api/gateway/backlog/exec/config");
  }

  async backlog_exec_requests(opts?: { status?: string; limit?: number }): Promise<BacklogExecRequestListResponse> {
    const qs = new URLSearchParams();
    const status = String(opts?.status || "").trim();
    if (status) qs.set("status", status);
    qs.set("limit", String(typeof opts?.limit === "number" && Number.isFinite(opts.limit) ? Number(opts.limit) : 200));
    return await this._get_json("backlog_exec_requests", `/api/gateway/backlog/exec/requests?${qs.toString()}`);
  }

  async backlog_exec_request(request_id: string, opts?: { include_prompt?: boolean }): Promise<BacklogExecRequestDetailResponse> {
    const rid = String(request_id || "").trim();
    if (!rid) throw new Error("backlog_exec_request: request_id is required");
    const qs = new URLSearchParams();
    if (opts?.include_prompt === true) qs.set("include_prompt", "true");
    return await this._get_json("backlog_exec_request", `/api/gateway/backlog/exec/requests/${encodeURIComponent(rid)}?${qs.toString()}`);
  }

  async backlog_exec_feedback(args: { request_id: string; feedback: string }): Promise<BacklogExecRequestDetailResponse> {
    const rid = String(args?.request_id || "").trim();
    if (!rid) throw new Error("backlog_exec_feedback: request_id is required");
    const feedback = String(args?.feedback ?? "");
    if (!feedback.trim()) throw new Error("backlog_exec_feedback: feedback is required");
    return await this._post_json("backlog_exec_feedback", `/api/gateway/backlog/exec/requests/${encodeURIComponent(rid)}/feedback`, { feedback });
  }

  async backlog_exec_promote(args: { request_id: string; redeploy?: boolean }): Promise<BacklogExecRequestDetailResponse> {
    const rid = String(args?.request_id || "").trim();
    if (!rid) throw new Error("backlog_exec_promote: request_id is required");
    const body: any = {};
    if (args?.redeploy === true) body.redeploy = true;
    return await this._post_json("backlog_exec_promote", `/api/gateway/backlog/exec/requests/${encodeURIComponent(rid)}/promote`, body);
  }

  async backlog_exec_deploy_uat(args: { request_id: string }): Promise<BacklogExecRequestDetailResponse> {
    const rid = String(args?.request_id || "").trim();
    if (!rid) throw new Error("backlog_exec_deploy_uat: request_id is required");
    return await this._post_json("backlog_exec_deploy_uat", `/api/gateway/backlog/exec/requests/${encodeURIComponent(rid)}/uat/deploy`, {});
  }

  async backlog_exec_log_tail(args: { request_id: string; name?: string; max_bytes?: number; after_bytes?: number }): Promise<BacklogExecLogTailResponse> {
    const rid = String(args?.request_id || "").trim();
    if (!rid) throw new Error("backlog_exec_log_tail: request_id is required");
    const qs = new URLSearchParams();
    const name = String(args?.name || "").trim();
    if (name) qs.set("name", name);
    const max_bytes = typeof args?.max_bytes === "number" && Number.isFinite(args.max_bytes) ? Number(args.max_bytes) : 0;
    if (max_bytes > 0) qs.set("max_bytes", String(Math.floor(max_bytes)));
    // Cursor follow (2026-07-12 gateway contract): with after_bytes the
    // response carries only the delta from that offset plus next_offset;
    // reset=true means the cursor is past EOF (rotation) — start over.
    const after_bytes = typeof args?.after_bytes === "number" && Number.isFinite(args.after_bytes) ? Math.max(0, Math.floor(args.after_bytes)) : null;
    if (after_bytes !== null) qs.set("after_bytes", String(after_bytes));
    return await this._get_json("backlog_exec_log_tail", `/api/gateway/backlog/exec/requests/${encodeURIComponent(rid)}/logs/tail?${qs.toString()}`);
  }

  async backlog_exec_active_items(opts?: { status?: string; limit?: number }): Promise<BacklogExecActiveItemsResponse> {
    const qs = new URLSearchParams();
    const status = String(opts?.status || "").trim();
    if (status) qs.set("status", status);
    qs.set("limit", String(typeof opts?.limit === "number" && Number.isFinite(opts.limit) ? Number(opts.limit) : 600));
    return await this._get_json("backlog_exec_active_items", `/api/gateway/backlog/exec/active_items?${qs.toString()}`);
  }

  // ------------------------------------------------- discovery + entities

  /** Providers configured on the gateway (discovery lane). */
  async discovery_providers(): Promise<DiscoveryProvidersResponse> {
    const r = await this._fetch("discovery_providers", "/api/gateway/discovery/providers");
    return (await r.json()) as DiscoveryProvidersResponse;
  }

  /** Per-model capability lookup (gateway GET /discovery/models/capabilities;
   *  reasoning-1st-citizen contract v1): `capabilities.thinking_support` +
   *  `capabilities.reasoning_levels` drive the three-state reasoning
   *  selector — present-supported / present-unsupported / ABSENT=UNKNOWN
   *  (locked with a set-anyway override; never a client-side table). */
  async discovery_model_capabilities(model_name: string): Promise<{ model?: string; capabilities?: Record<string, any>; error?: string }> {
    const name = String(model_name || "").trim();
    if (!name) throw new Error("discovery_model_capabilities: model_name is required");
    const r = await this._fetch("discovery_model_capabilities", `/api/gateway/discovery/models/capabilities?model_name=${encodeURIComponent(name)}`);
    return await r.json();
  }

  /** Model names served by one provider (cascades from the provider pick). */
  async discovery_provider_models(provider: string): Promise<DiscoveryProviderModelsResponse> {
    const name = String(provider || "").trim();
    if (!name) throw new Error("discovery_provider_models: provider is required");
    const r = await this._fetch("discovery_provider_models", `/api/gateway/discovery/providers/${encodeURIComponent(name)}/models`);
    return (await r.json()) as DiscoveryProviderModelsResponse;
  }

  /** Summoned entities hosted on this gateway (workforce roster). */
  async list_entities(): Promise<EntityListResponse> {
    const r = await this._fetch("list_entities", "/api/gateway/entities");
    return (await r.json()) as EntityListResponse;
  }

  // ---------------------------------------------------------- admin config
  // Feature-detected surfaces (gateway contract c1554, lands next gateway
  // cycle): callers treat a 404 as "surface not built yet" and fall back
  // to the read-only posture probes — never a dead control.

  /** Authoritative runtime-config posture with per-knob source chain. */
  async admin_runtime_config(): Promise<AdminRuntimeConfigResponse> {
    const r = await this._fetch("admin_runtime_config", "/api/gateway/admin/runtime-config");
    return (await r.json()) as AdminRuntimeConfigResponse;
  }

  /** Executor registry (pluggable executors: codex/claude-code/…). */
  async admin_executors(): Promise<AdminExecutorsResponse> {
    const r = await this._fetch("admin_executors", "/api/gateway/admin/executors");
    return (await r.json()) as AdminExecutorsResponse;
  }

  /** Admin-gated partial config write (POST body = only the keys to
   *  change; live-verified 2026-07-13). Refusals are operator-readable
   *  4xx — render them verbatim. Returns the updated posture. */
  async admin_runtime_config_update(patch: {
    process_manager?: boolean | null;
    /** A folder path; null clears the saved value (back to the default). */
    triage_repo_root?: string | null;
    backlog_exec_runner?: boolean | null;
    executor?: string;
  }): Promise<AdminRuntimeConfigResponse> {
    const r = await this._fetch("admin_runtime_config_update", "/api/gateway/admin/runtime-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch || {}),
    });
    return (await r.json()) as AdminRuntimeConfigResponse;
  }

  /** Entity lifecycle verb (gateway a2a 0008 surface: POST
   *  /entities/{name}/state — operator-channel wake/sleep). Refusals are
   *  operator-readable 4xx (asleep entity, held lease, non-admin) —
   *  render them verbatim; the gateway is the authority. */
  async entity_state(name: string, args: { state: "awake" | "asleep"; reason?: string }): Promise<any> {
    const r = await this._fetch("entity_state", `/api/gateway/entities/${encodeURIComponent(name)}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return await r.json();
  }

  /** Entity skills: selection + resolved roster + the PhaseCapabilityMatrix
   *  payload (gateway c3038 dispatch; SERVER truth — the console renders,
   *  never re-derives the trust gate). */
  async entity_skills(name: string): Promise<{ selection?: any; resolved?: any; matrix?: unknown }> {
    const r = await this._fetch("entity_skills", `/api/gateway/entities/${encodeURIComponent(name)}/skills`);
    return await r.json();
  }

  /** Replace the entity's skills selection (WHOLE-DOCUMENT: the complete
   *  list; empty deselects everything). Response = the resolved view, so
   *  a typo'd name or blocked skill is visible the moment it is written. */
  async put_entity_skills(name: string, skills: Array<{ name: string; phases?: string[] }>): Promise<{ selection?: any; resolved?: any; matrix?: unknown }> {
    const r = await this._fetch("put_entity_skills", `/api/gateway/entities/${encodeURIComponent(name)}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills }),
    });
    return await r.json();
  }

  /** Bundle catalog (advisor dropdown source) — the REAL endpoint is
   *  /api/gateway/bundles with entrypoints carrying `interfaces`
   *  (observer-proven against the live gateway; the first guess
   *  /api/gateway/workflows 404'd and silently fell back to the text
   *  input — operator caught it 21:43). */
  async list_bundles(): Promise<any> {
    const r = await this._fetch("list_bundles", "/api/gateway/bundles");
    return await r.json();
  }

  /** Registered data homes (read-only telemetry slice, c1580 ask 3 /
   *  c1729 claim; purge stays the gateway console's surface). */
  async admin_data_homes(): Promise<DataHomesResponse> {
    const r = await this._fetch("admin_data_homes", "/api/gateway/admin/data-homes");
    return (await r.json()) as DataHomesResponse;
  }

  // -------------------------------------------------------- managed processes

  /** Versions the gateway reports for the About dialog (public route, no
   *  secrets or paths): `{ abstractframework, abstractgateway, packages }`. */
  async gateway_about(): Promise<any> {
    return await this._get_json("gateway_about", "/api/gateway/about");
  }

  async list_processes(): Promise<ProcessListResponse> {
    return await this._get_json("list_processes", "/api/gateway/processes");
  }

  async list_process_env_vars(): Promise<ManagedEnvVarListResponse> {
    return await this._get_json("list_process_env_vars", "/api/gateway/processes/env");
  }

  async update_process_env_vars(args: { set?: Record<string, string>; unset?: string[] }): Promise<ManagedEnvVarListResponse> {
    const req_body: any = {};
    const set0 = args?.set && typeof args.set === "object" ? args.set : {};
    const unset0 = Array.isArray(args?.unset) ? args?.unset : [];
    if (set0 && Object.keys(set0).length) req_body.set = set0;
    if (unset0 && unset0.length) req_body.unset = unset0;
    return await this._post_json("update_process_env_vars", "/api/gateway/processes/env", req_body);
  }

  async start_process(process_id: string): Promise<ProcessActionResponse> {
    const pid = String(process_id || "").trim();
    return await this._post_json("start_process", `/api/gateway/processes/${encodeURIComponent(pid)}/start`);
  }

  async stop_process(process_id: string): Promise<ProcessActionResponse> {
    const pid = String(process_id || "").trim();
    return await this._post_json("stop_process", `/api/gateway/processes/${encodeURIComponent(pid)}/stop`);
  }

  async restart_process(process_id: string): Promise<ProcessActionResponse> {
    const pid = String(process_id || "").trim();
    return await this._post_json("restart_process", `/api/gateway/processes/${encodeURIComponent(pid)}/restart`);
  }

  async redeploy_process(process_id: string): Promise<ProcessActionResponse> {
    const pid = String(process_id || "").trim();
    return await this._post_json("redeploy_process", `/api/gateway/processes/${encodeURIComponent(pid)}/redeploy`);
  }

  async process_log_tail(process_id: string, opts?: { max_bytes?: number }): Promise<ProcessLogTailResponse> {
    const pid = String(process_id || "").trim();
    const max_bytes = typeof opts?.max_bytes === "number" ? Math.max(1024, Math.min(400000, Math.floor(opts.max_bytes))) : 80000;
    return await this._get_json(
      "process_log_tail",
      `/api/gateway/processes/${encodeURIComponent(pid)}/logs/tail?max_bytes=${encodeURIComponent(String(max_bytes))}`
    );
  }
}

function _report_create_body(
  req: {
    session_id: string;
    description: string;
    active_run_id?: string | null;
    workflow_id?: string | null;
    client?: string | null;
    client_version?: string | null;
    user_agent?: string | null;
    url?: string | null;
    provider?: string | null;
    model?: string | null;
    template?: string | null;
    context?: any;
  },
  label: string
): any {
  const sid = String(req?.session_id || "").trim();
  if (!sid) throw new Error(`${label}: session_id is required`);
  const description = String(req?.description || "").trim();
  if (!description) throw new Error(`${label}: description is required`);

  const body: any = { session_id: sid, description };
  for (const key of ["active_run_id", "workflow_id", "client", "client_version", "user_agent", "url", "provider", "model", "template"] as const) {
    const value = String((req as any)?.[key] || "").trim();
    if (value) body[key] = value;
  }
  const context = req?.context;
  if (context && typeof context === "object") body.context = context;
  return body;
}
