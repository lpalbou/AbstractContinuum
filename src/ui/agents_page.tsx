// Agents & Entities — the workforce console: execution agents (a pluggable
// executor seam: codex today, claude-code/opencode/abstractcode tomorrow),
// advisory agents, and SUMMONED ENTITIES (operator directive 2026-07-13:
// "one summoned entity by package… we may want to develop with either an
// agent or with a summoned entity — both should be possible").
//
// Honest scope: the roster renders what the gateway serves TODAY —
// exec config (one env-driven executor), the entity registry
// (GET /entities), and per-agent stats folded from execution history.
// Skills, MCP grants, and agora charters per workforce member are asked
// from the owning seats (commons c1550/c1552); those panes land on their
// contracts, not on invented client state.
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";

import type { AdminExecutorInfo, BacklogExecConfigResponse, BacklogExecRequestSummary, EntitySummary, GatewayClient } from "../lib/gateway_client";
import { exec_time_stats, format_duration_ms } from "./backlog/model";
import { EntitySkillsPanel } from "./entity_skills_panel";

type AgentStats = {
  agent: string;
  model: string;
  runs: number;
  active: number;
  promoted: number;
  completed: number;
  failed: number;
  awaiting_qa: number;
  total_run_ms: number;
  timed_runs: number;
  last_active: string;
};

export function fold_agent_stats(requests: BacklogExecRequestSummary[]): AgentStats[] {
  const by_agent = new Map<string, AgentStats>();
  for (const r of requests) {
    // Attribution NEVER fabricates an executor: target_agent > the wire's
    // executor_type + model > a neutral label (adversary find 2026-07-13 —
    // a hardcoded codex: prefix would mislabel tomorrow's claude-code runs).
    const agent = String(
      r.target_agent || (r.target_model ? `${String((r as any).executor_type || "agent").trim() || "agent"}:${r.target_model}` : "") || "(unattributed)"
    ).trim();
    let s = by_agent.get(agent);
    if (!s) {
      s = {
        agent,
        model: String(r.target_model || "").trim(),
        runs: 0,
        active: 0,
        promoted: 0,
        completed: 0,
        failed: 0,
        awaiting_qa: 0,
        total_run_ms: 0,
        timed_runs: 0,
        last_active: "",
      };
      by_agent.set(agent, s);
    }
    s.runs += 1;
    const st = String(r.status || "").toLowerCase();
    if (st === "queued" || st === "running") s.active += 1;
    else if (st === "promoted") s.promoted += 1;
    else if (st === "completed") s.completed += 1;
    else if (st === "failed") s.failed += 1;
    else if (st === "awaiting_qa") s.awaiting_qa += 1;
    const stats = exec_time_stats(r);
    if (stats.run_ms != null) {
      s.total_run_ms += stats.run_ms;
      s.timed_runs += 1;
    }
    const ts = String(r.finished_at || r.started_at || r.created_at || "");
    if (ts > s.last_active) s.last_active = ts;
  }
  return [...by_agent.values()].sort((a, b) => b.runs - a.runs);
}

export function AgentsPage(props: {
  gateway: GatewayClient;
  gateway_connected: boolean;
  backlog_advisor_agent?: string;
  /** Opens the shell assistant drawer (the advisor card's action). */
  on_open_assistant?: () => void;
  /** Navigation jumps for the capabilities rows (live features link to
   *  their surface — a capability row without an act is a placard). */
  on_open_team?: () => void;
  on_open_executions?: () => void;
}): React.ReactElement {
  const { gateway, gateway_connected } = props;
  const advisor_agent = String(props.backlog_advisor_agent || "").trim() || "basic-agent";

  const [cfg, set_cfg] = useState<BacklogExecConfigResponse | null>(null);
  const [requests, set_requests] = useState<BacklogExecRequestSummary[]>([]);
  const [entities, set_entities] = useState<EntitySummary[]>([]);
  const [entities_error, set_entities_error] = useState("");
  /** Executor registry rows once GET /admin/executors serves (c1554). */
  const [executors, set_executors] = useState<AdminExecutorInfo[] | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState("");
  /** Admin write authority (writable === true) — gates the Set default
   *  action; the gateway stays the authority on every write. */
  const [admin_writable, set_admin_writable] = useState(false);
  const [action_busy, set_action_busy] = useState("");
  /** Per-target refusal (keyed like action_busy) — a banner one screen
   *  above the clicked button is a refusal nobody sees (adversary find). */
  const [action_error, set_action_error] = useState<{ key: string; text: string } | null>(null);
  /** Staleness guard: a refresh() response that started BEFORE a verb
   *  must never overwrite the verb's fresher refetch (adversary race). */
  const data_gen = useRef(0);

  async function refresh(): Promise<void> {
    if (!gateway_connected || loading) return;
    const gen = ++data_gen.current;
    set_loading(true);
    set_error("");
    try {
      // Status-scoped fetches (same rule as the board): live requests must
      // never fall out of a window churned by terminal history.
      const [cfg_res, active_res, terminal_res] = await Promise.all([
        gateway.backlog_exec_config(),
        gateway.backlog_exec_requests({ status: "queued,running,awaiting_qa", limit: 200 }),
        gateway.backlog_exec_requests({ status: "promoted,completed,failed", limit: 200 }),
      ]);
      if (gen !== data_gen.current) return; // a verb refetched fresher data mid-flight
      set_cfg(cfg_res);
      set_requests([
        ...(Array.isArray(active_res?.requests) ? active_res.requests : []),
        ...(Array.isArray(terminal_res?.requests) ? terminal_res.requests : []),
      ]);
    } catch (e: any) {
      if (gen === data_gen.current) set_error(String(e?.message || e || "Failed to load agents"));
    } finally {
      if (gen === data_gen.current) set_loading(false);
      else set_loading(false);
    }
    // Entities load independently: a gateway without the entity lane must
    // not degrade the agent roster (and vice versa).
    try {
      const res = await gateway.list_entities();
      if (gen !== data_gen.current) return;
      set_entities(Array.isArray(res?.entities) ? res.entities : []);
      set_entities_error("");
    } catch (e: any) {
      if (gen !== data_gen.current) return;
      set_entities([]);
      set_entities_error(`#FALLBACK entity registry unavailable: ${String(e?.message || e)}`);
    }
    // Executor registry: feature-detected (contract c1554 — lands next
    // gateway cycle). 404 = single-executor posture from exec config.
    try {
      const res = await gateway.admin_executors();
      if (gen !== data_gen.current) return;
      const rows = Array.isArray(res) ? res : Array.isArray((res as any)?.executors) ? (res as any).executors : [];
      set_executors(rows);
    } catch {
      if (gen === data_gen.current) set_executors((cur) => (cur === null ? null : cur));
    }
    // Write authority for the Set-default action (feature-detected).
    try {
      const cfg_admin = await gateway.admin_runtime_config();
      if (gen === data_gen.current) set_admin_writable(cfg_admin?.writable === true);
    } catch {
      if (gen === data_gen.current) set_admin_writable(false);
    }
  }

  /** Scoped refetchers: verbs re-read ONLY the surface they changed and
   *  BUMP the generation so an older refresh() response landing later
   *  cannot overwrite the verb's fresher truth (adversary race find). */
  async function refetch_entities(): Promise<void> {
    data_gen.current += 1;
    try {
      const res = await gateway.list_entities();
      set_entities(Array.isArray(res?.entities) ? res.entities : []);
      set_entities_error("");
    } catch (e: any) {
      set_entities_error(`#FALLBACK entity registry unavailable: ${String(e?.message || e)}`);
    }
  }

  async function refetch_executors(): Promise<void> {
    data_gen.current += 1;
    try {
      const res = await gateway.admin_executors();
      const rows = Array.isArray(res) ? res : Array.isArray((res as any)?.executors) ? (res as any).executors : [];
      set_executors(rows);
    } catch {
      // A transient blip right after a successful write must not collapse
      // the whole registry into the single-card fallback — keep the rows
      // (adversary find).
    }
    try {
      set_cfg(await gateway.backlog_exec_config());
    } catch {
      // posture keeps its previous value; the registry answer above stands
    }
  }

  /** Set the gateway default executor (admin, gateway-authorized). */
  async function set_default_executor(id: string): Promise<void> {
    if (action_busy) return;
    const key = `executor:${id}`;
    set_action_busy(key);
    set_action_error(null);
    try {
      await gateway.admin_runtime_config_update({ executor: id });
      await refetch_executors();
    } catch (e: any) {
      set_action_error({ key, text: String(e?.message || e || "Executor change refused") });
    } finally {
      set_action_busy("");
    }
  }

  /** Which entity's Skills panel is expanded (one at a time). */
  const [skills_open, set_skills_open] = useState<string | null>(null);

  /** Entity lifecycle verb: wake/sleep through the gateway's operator
   *  door. Refusals (held lease, mid-visit, non-admin) render verbatim. */
  async function entity_verb(ent: EntitySummary, state: "awake" | "asleep"): Promise<void> {
    if (action_busy) return;
    const name = String(ent.slug || ent.name || "").trim();
    if (!name) return;
    const key = `entity:${name}`;
    set_action_busy(key);
    set_action_error(null);
    try {
      await gateway.entity_state(name, { state, reason: `by the operator via Continuum (Agents & Entities)` });
      await refetch_entities();
    } catch (e: any) {
      set_action_error({ key, text: String(e?.message || e || "State change refused") });
    } finally {
      set_action_busy("");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway_connected]);

  const stats = useMemo(() => fold_agent_stats(requests), [requests]);
  const worker_on = Boolean(cfg?.runner_alive);
  const raw_executor = String(cfg?.executor || "").trim();
  const no_executor = !raw_executor || raw_executor === "none";
  const executor_label = no_executor ? "No execution agent" : raw_executor;

  return (
    <div className="page page_scroll">
      <div className="page_inner page_pad constrained">
        <div className="page_toolbar">
          <span className="page_hint">
            The workforce behind the pipeline — the executor is a pluggable seam; this console renders whatever the gateway reports.
          </span>
          {error ? <span className="page_error mono">{error}</span> : null}
          <div className="page_toolbar_spacer" />
          <button
            className={`btn btn_icon ${loading ? "is_loading" : ""}`}
            onClick={() => void refresh()}
            disabled={!gateway_connected || loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>

        <div className="agents_grid">
          {executors !== null && executors.length ? (
            // Registry mode (c1554 surface live): one card per pluggable
            // executor — codex / claude-code / opencode / abstractcode.
            executors.map((ex) => (
              <div className="entity_card" key={ex.id}>
                <div className="entity_card_head">
                  <span className="agent_avatar" aria-hidden="true"><Icon name="terminal" size={16} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="entity_card_title">{ex.display || ex.id}</div>
                    <div className="entity_card_sub">execution agent{ex.default ? " · gateway default" : ""}</div>
                  </div>
                  <span className={`chip mono ${ex.available ? "ok" : "danger"}`} style={{ marginLeft: "auto" }}>
                    {ex.available ? "available" : "unavailable"}
                  </span>
                </div>
                <div className="agent_facts">
                  {Array.isArray(ex.models) && ex.models.length ? (
                    <div>
                      <span className="muted">models:</span> {ex.models.slice(0, 4).join(", ")}
                      {ex.models.length > 4 ? ` +${ex.models.length - 4}` : ""}
                    </div>
                  ) : null}
                </div>
                <div className="entity_card_actions">
                  {ex.default ? (
                    <span className="chip mono ok" title="New executions run under this agent unless the request overrides it.">
                      gateway default
                    </span>
                  ) : admin_writable ? (
                    <button
                      className="btn"
                      disabled={Boolean(action_busy) || ex.available === false}
                      title={
                        ex.available === false
                          ? "Unavailable on the gateway host — the binary is not on its PATH"
                          : action_busy && action_busy !== `executor:${ex.id}`
                            ? "Another action is in flight"
                            : "Make this the gateway's default executor (admin, persisted gateway-side)"
                      }
                      onClick={() => void set_default_executor(ex.id)}
                    >
                      {action_busy === `executor:${ex.id}` ? "Setting…" : "Set as default"}
                    </button>
                  ) : (
                    <span className="chip mono muted" title="Changing the default executor is admin-only — the gateway authorizes it (Settings → Gateway administration).">
                      admin only
                    </span>
                  )}
                </div>
                {action_error?.key === `executor:${ex.id}` ? <div className="detail_warn">{action_error.text}</div> : null}
              </div>
            ))
          ) : cfg ? (
            <div className="entity_card">
              <div className="entity_card_head">
                <span className="agent_avatar" aria-hidden="true"><Icon name="terminal" size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="entity_card_title">{executor_label}</div>
                  <div className="entity_card_sub">
                    {no_executor ? "enable one from Settings → Gateway administration" : "execution agent (gateway-configured)"}
                  </div>
                </div>
                <span className={`chip mono ${worker_on ? "ok" : no_executor ? "warn" : "danger"}`} style={{ marginLeft: "auto" }}>
                  {worker_on ? "available" : no_executor ? "not configured" : "offline"}
                </span>
              </div>
              <div className="agent_facts">
                {cfg.codex_model ? (
                  <div>
                    <span className="muted">model:</span> {cfg.codex_model}
                  </div>
                ) : null}
                {cfg.codex_reasoning_effort ? (
                  <div>
                    <span className="muted">reasoning:</span> {cfg.codex_reasoning_effort}
                  </div>
                ) : null}
                <div>
                  <span className="muted">can execute:</span> {cfg.can_execute ? "yes" : "no"}
                </div>
                {cfg.runner_error ? <div className="page_error">{cfg.runner_error}</div> : null}
              </div>
            </div>
          ) : null}

          <div className="entity_card">
            <div className="entity_card_head">
              <span className="agent_avatar" aria-hidden="true"><Icon name="edit" size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="entity_card_title">{advisor_agent}</div>
                <div className="entity_card_sub">backlog advisor (read-only chat agent)</div>
              </div>
              <span className="chip mono muted" style={{ marginLeft: "auto" }}>
                advisory
              </span>
            </div>
            <div className="agent_facts">
              <div>
                <span className="muted">surface:</span> assistant drawer + Backlog advisor
              </div>
              <div>
                <span className="muted">writes:</span> none (advice only)
              </div>
            </div>
            <div className="entity_card_actions">
              <button
                className="btn"
                onClick={() => props.on_open_assistant?.()}
                disabled={!props.on_open_assistant}
                title="Open the assistant drawer and ask this advisor a question"
              >
                Ask the advisor
              </button>
            </div>
          </div>
        </div>



        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Summoned entities</span>
            <span className="pane_count">
              {entities.length} on this gateway
            </span>
            <span className="pane_header_actions muted" style={{ fontSize: "var(--font-size-xs)" }}>
              persistent minds with full package history — recruitable for development alongside agents
            </span>
          </div>
          <div className="pane_body">
            {entities_error ? (
              <div className="page_error" style={{ fontSize: "var(--font-size-sm)" }}>{entities_error}</div>
            ) : null}
            {!entities_error && !entities.length ? (
              <div className="empty_note">
                No summoned entities on this gateway yet. Entities are created and summoned through the gateway (its CLI/console); once
                they exist they appear here as recruitable developers.
              </div>
            ) : null}
            {entities.length ? (
              <div className="agents_grid" style={{ marginTop: 0 }}>
                {entities.map((ent) => {
                  // Gateway-labeled error rows (unreadable manifest, moved-home
                  // collision) render as DANGER, never as a healthy card —
                  // the label exists so the operator sees the stray copy
                  // (adversary find: it was being dropped).
                  if (ent.error) {
                    return (
                      <div className="entity_card" key={ent.entity_id || ent.slug || ent.name} style={{ borderColor: "var(--danger, rgb(248,113,113))" }}>
                        <div className="entity_card_head">
                          <span className="agent_avatar" aria-hidden="true">
                            <Icon name="warning" size={16} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="entity_card_title">{ent.name || ent.slug || "(unreadable home)"}</div>
                            <div className="entity_card_sub mono">{ent.entity_id || ent.slug}</div>
                          </div>
                          <span className="chip mono danger" style={{ marginLeft: "auto" }}>
                            error
                          </span>
                        </div>
                        <div className="detail_warn" style={{ marginTop: 0 }}>{ent.error}</div>
                      </div>
                    );
                  }
                  const state = String(ent.state?.state || "unknown").toLowerCase();
                  const state_tone = state === "awake" ? "ok" : state === "asleep" ? "info" : state === "paused" ? "warn" : "muted";
                  // Liveness is the SERVED operator axis (gateway c2149,
                  // decision:entity-liveness-axis v3): render it when the
                  // wire carries it, never derive it client-side. STOPPED
                  // outranks the state chip in danger tone (the ruled
                  // render contract for roster badges).
                  const liveness = String(ent.liveness || ent.state?.liveness || "").toLowerCase();
                  const stopped = liveness === "stopped";
                  return (
                    <div className="entity_card" key={ent.entity_id || ent.slug}>
                      <div className="entity_card_head">
                        <span className="agent_avatar" aria-hidden="true">
                          <Icon name="agent" size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="entity_card_title">{ent.name || ent.slug}</div>
                          <div className="entity_card_sub mono">{ent.entity_id}</div>
                        </div>
                        {stopped ? (
                          <span
                            className="chip mono danger"
                            style={{ marginLeft: "auto" }}
                            title={`The kill switch: served liveness=stopped (state: ${state}). Restore lives on the gateway console.`}
                          >
                            STOPPED
                          </span>
                        ) : (
                          <span className={`chip mono ${state_tone}`} style={{ marginLeft: "auto" }}>
                            {state}
                          </span>
                        )}
                      </div>
                      <div className="agent_facts">
                        {ent.created_at ? (
                          <div>
                            <span className="muted">born:</span> {new Date(ent.created_at).toLocaleDateString()}
                          </div>
                        ) : null}
                        {ent.state?.reason ? (
                          <div>
                            <span className="muted">state reason:</span> {ent.state.reason}
                          </div>
                        ) : null}
                        <div>
                          <span className="muted">home:</span> spark {ent.files?.spark ? "✓" : "—"} · memory {ent.files?.memory ? "✓" : "—"} ·
                          book {ent.files?.book ? "✓" : "—"}
                        </div>
                      </div>
                      <div className="entity_card_actions">
                        {/* Lifecycle verbs through the gateway's operator
                            door — the gateway authorizes; refusals render
                            verbatim (asleep/held-lease/non-admin). Stopped
                            entities restore from the gateway console (the
                            kill switch keeps ONE management surface). A
                            PAUSED entity offers Wake too — the gateway
                            decides whether to allow it (adversary find:
                            paused cards were dead ends). */}
                        {!stopped && (state === "asleep" || state === "paused") ? (
                          <button
                            className="btn"
                            disabled={Boolean(action_busy)}
                            title={
                              action_busy && action_busy !== `entity:${ent.slug || ent.name}`
                                ? "Another action is in flight"
                                : "Wake this entity (operator act, recorded as a host marker; the gateway authorizes or refuses)"
                            }
                            onClick={() => void entity_verb(ent, "awake")}
                          >
                            {action_busy === `entity:${ent.slug || ent.name}` ? "Waking…" : "Wake"}
                          </button>
                        ) : null}
                        {!stopped && state === "awake" ? (
                          <button
                            className="btn"
                            disabled={Boolean(action_busy)}
                            title={
                              action_busy && action_busy !== `entity:${ent.slug || ent.name}`
                                ? "Another action is in flight"
                                : "Graceful sleep (in-flight work finishes; reflection runs). The gateway refuses if a visit is live."
                            }
                            onClick={() => void entity_verb(ent, "asleep")}
                          >
                            {action_busy === `entity:${ent.slug || ent.name}` ? "Sending…" : "Sleep"}
                          </button>
                        ) : null}
                        {stopped ? (
                          <span className="chip mono warn" title="Restore lives on the gateway console — the kill switch keeps one management surface.">
                            restore via gateway console
                          </span>
                        ) : null}
                        {/* Skills management (c3038 ask 2): the console half
                            of the skills UI — selection + trust verdicts +
                            the phase matrix, all server-resolved. */}
                        <button
                          className="btn"
                          onClick={() => set_skills_open((cur) => (cur === (ent.name || ent.slug) ? null : ent.name || ent.slug || null))}
                          title="What this mind is taught, per phase (selection persists in the entity's home; changes record as host markers)"
                        >
                          {skills_open === (ent.name || ent.slug) ? "Hide skills" : "Skills"}
                        </button>
                      </div>
                      {action_error?.key === `entity:${ent.slug || ent.name}` ? <div className="detail_warn">{action_error.text}</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {skills_open ? (
              <EntitySkillsPanel gateway={gateway} entity_name={skills_open} on_close={() => set_skills_open(null)} />
            ) : null}
          </div>
        </div>

        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Capabilities</span>
            <span className="pane_subtitle">live features link to their surface; pending ones name their owner</span>
          </div>
          <div className="pane_body">
            {/* Every row is a STATUS + an ACT (or an honest owner note) —
                a capabilities table nothing could click was a placard
                (operator 2026-07-15 00:34). */}
            <div className="cap_rows">
              <div className="cap_row">
                <div className="cap_row_head">
                  <span className="cap_row_name">Executor choice per task</span>
                  <span className="chip mono ok">live</span>
                  {props.on_open_executions ? (
                    <button className="btn cap_row_action" onClick={props.on_open_executions} title="Watch runs execute under their chosen agent">
                      Open Executions
                    </button>
                  ) : null}
                </div>
                <div className="cap_row_detail">
                  Every Execute dialog (Board and Backlog) carries an Execution agent dropdown — codex, claude, cursor-agent, abstractcode,
                  probed live by the gateway. The default is set on the executor cards above; runs attribute canonically in the track record.
                </div>
              </div>

              <div className="cap_row">
                <div className="cap_row_head">
                  <span className="cap_row_name">Skills per run and per member</span>
                  <span className="chip mono warn">partial</span>
                  {props.on_open_executions ? (
                    <button className="btn cap_row_action" onClick={props.on_open_executions} title="Run detail → Skills section shows which teachings rode each run">
                      View on a run
                    </button>
                  ) : null}
                </div>
                <div className="cap_row_detail">
                  Which skills rode each run renders in the run detail today (requested vs active, held verdicts verbatim). Per-MEMBER skill
                  grants (trust levels, review badges) land when the gateway serves the abstractskill union contract over HTTP (c1778) — the
                  cards above grow a Skills action that day.
                </div>
              </div>

              <div className="cap_row">
                <div className="cap_row_head">
                  <span className="cap_row_name">MCP access grants</span>
                  <span className="chip mono muted">pending contract</span>
                </div>
                <div className="cap_row_detail">
                  Per-member MCP grants — the ruled home is the gateway's phases config family, endpoint mirroring tool-policy (c1554). No
                  continuum surface until the gateway serves it; this row turns live then.
                </div>
              </div>

              <div className="cap_row">
                <div className="cap_row_head">
                  <span className="cap_row_name">Agora charters and recruitment</span>
                  <span className="chip mono info">read live</span>
                  {props.on_open_team ? (
                    <button className="btn cap_row_action" onClick={props.on_open_team} title="Team page → ⓘ About shows each channel's charter, purpose, SLA, and members">
                      Open Team
                    </button>
                  ) : null}
                </div>
                <div className="cap_row_detail">
                  Per-channel charters, purpose, SLA, and members render on the Team page (ⓘ About on any channel). Charter WRITES and
                  recruitment criteria are the next hub-proxy slice — writes are governance acts and get their own confirmation surface.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pane">
          <div className="pane_header">
            <span className="pane_title">Track record</span>
            <span className="pane_count">{stats.length} agent{stats.length === 1 ? "" : "s"}</span>
            <span className="pane_header_actions muted" style={{ fontSize: "var(--font-size-xs)" }}>
              all live + last 200 finished — counts, not quality
            </span>
          </div>
          <div className="pane_body" style={{ padding: 0 }}>
            {!stats.length ? (
              <div className="muted" style={{ fontSize: "var(--font-size-sm)", padding: "12px" }}>
                No execution history yet.
              </div>
            ) : (
              <div className="table_scroll">
              <table className="data_table track_table">
                <thead>
                  <tr>
                    <th>agent</th>
                    <th>runs</th>
                    <th className="col_aux">active</th>
                    <th className="col_aux">promoted</th>
                    <th className="col_aux">completed</th>
                    <th className="col_aux">in review</th>
                    <th>failed</th>
                    <th className="col_aux2">avg run</th>
                    <th className="col_aux2">last active</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.agent}>
                      <td className="td_agent mono">{s.agent}</td>
                      <td>{s.runs}</td>
                      <td className="col_aux">{s.active || ""}</td>
                      <td className="col_aux">{s.promoted || ""}</td>
                      <td className="col_aux">{s.completed || ""}</td>
                      <td className="col_aux">{s.awaiting_qa || ""}</td>
                      <td className={s.failed ? "page_error" : ""}>{s.failed || ""}</td>
                      <td className="col_aux2 td_time">{s.timed_runs ? format_duration_ms(s.total_run_ms / s.timed_runs) : ""}</td>
                      <td className="col_aux2 td_time">{s.last_active ? new Date(s.last_active).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
