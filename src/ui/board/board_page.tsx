// The Board: kanban over the development flow. Columns derive from
// backlog kind + exec status (board_model.derive_board_cards); cards carry
// type/priority/label chips (lazy metadata) and a readiness dot; the
// drawer opens on click. Execute is DoR-gated with fetch-on-demand
// readiness (named checks, explicit unknown state, labeled override).
// Triage↔Ready move by drag or buttons.
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { GatewayClient } from "../../lib/gateway_client";
import { BacklogEmptyState, BacklogUnavailablePanel, use_backlog_status } from "../backlog_folder";
import { use_executor_registry, use_media_query } from "../backlog/hooks";
import { type AgentOverride, ExecuteConfirmModal } from "../backlog/execute_modals";
import { WORK_ITEM_TYPES, format_duration_ms, read_task_type, task_type_chip, task_type_title } from "../backlog/model";
import { use_exec_pipeline } from "../backlog/use_exec_pipeline";
import {
  apply_work_claims,
  BOARD_COLUMNS,
  type BoardCard,
  type BoardColumnId,
  PRIORITIES,
  type Readiness,
  card_has_chip_meta,
  chip_labels,
  chip_priority,
  evaluate_readiness,
  parse_work_item_metadata,
  readiness_from_dor_refusal,
  card_is_decision_gate,
} from "./board_model";
import { claim_age_label, parse_card_path, parse_work_id } from "../../lib/work_id";
import { use_work_claims } from "./use_work_claims";
import { use_board_data } from "./use_board_data";
import { type TeamFocus, WorkActivityPanel } from "./work_activity_panel";
import { WorkItemDrawer, type DrawerTarget } from "./work_item_drawer";

export function BoardPage(props: {
  gateway: GatewayClient;
  gateway_connected: boolean;
  data_nonce: number;
  on_mutated: () => void;
  /** Jump to Executions, optionally pre-selecting a request (no context loss). */
  on_open_executions: (request_id?: string) => void;
  /** Preselected mode in the execute dialog (Settings). */
  default_execution_mode?: "uat" | "inplace";
  /** One-shot search preset (Team work-id chips navigate here filtered). */
  query_preset?: string | null;
  on_query_preset_consumed?: () => void;
  /** Board -> Team navigation (dm 110): open a channel scrolled to a
   *  citing message. */
  on_open_team?: (focus: TeamFocus) => void;
  /** Opens the New task modal (the empty board's "Create your first item"). */
  on_new_task?: () => void;
}): React.ReactElement {
  const { gateway, gateway_connected, data_nonce, on_mutated, on_open_executions } = props;
  const default_mode = props.default_execution_mode === "inplace" ? "inplace" : "uat";
  const is_compact = use_media_query("(max-width: 900px)");
  // Per-request agent picker options (gateway c2194 point 5).
  const executor_registry = use_executor_registry(gateway, gateway_connected);

  const board = use_board_data({ gateway, can_use_gateway: gateway_connected, data_nonce });
  // Where the backlog lives (gateway mission II): the unavailable panel and
  // the empty state name the folder; refetched after a settings change.
  const [folder_nonce, set_folder_nonce] = useState(0);
  const backlog_folder = use_backlog_status(gateway, gateway_connected, data_nonce + folder_nonce);
  const folder_unavailable = board.unconfigured || backlog_folder.status?.available === false;
  const board_empty = !folder_unavailable && board.item_count === 0 && !board.error;

  // SEAT-WORK join (S3, Option A c3010): live hub pointer claims move
  // planned cards into In Progress with a "claimed by X" chip; claims
  // without a file card render synthetically (dm 94). The lane rides the
  // HUB proxy — deliberately NOT gated on the gateway connection (team
  // work must show even when the gateway session is down); refusals
  // disable it silently (chips absent).
  const work_claims = use_work_claims(true);
  const cards = useMemo(() => apply_work_claims(board.cards, work_claims), [board.cards, work_claims]);

  // Worker config for the execute gate (reuses the pipeline hook's config
  // loader only — polling stays off because is_exec_view=false here).
  const pipeline = use_exec_pipeline({
    gateway,
    can_use_gateway: gateway_connected,
    kind: "planned",
    completed_view: "tasks",
    is_exec_view: false,
    is_compact_layout: is_compact,
    set_compact_pane: () => {},
    on_status_transfer: () => {},
  });

  // Filters run on LIST data (search/package/type) + hydrated-label facets.
  // The facet row is honest about coverage: a "scanned X/Y" pill shows how
  // much of the board the lazy metadata cache has parsed (#FALLBACK until
  // the gateway serves list-level metadata — ask on file).
  const [query, set_query] = useState("");
  // One-shot preset from a Team work-id chip: land filtered to the item.
  // The zero-padded number is the searchable token (filenames carry
  // NNNN_slug, not the full <package>-<NNNN> spelling yet — additive
  // migration); 4 digits keeps collisions negligible.
  useEffect(() => {
    if (!props.query_preset) return;
    const parsed = parse_work_id(props.query_preset);
    set_query(parsed ? parsed.num.padStart(4, "0") : props.query_preset);
    props.on_query_preset_consumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.query_preset]);
  const [package_filter, set_package_filter] = useState("all");
  const [type_filter, set_type_filter] = useState("all");
  const [label_facet, set_label_facet] = useState("");
  /** Supervision view (c1631): room coordination rows only. */
  const [supervision, set_supervision] = useState(false);

  const [drawer_target, set_drawer_target] = useState<DrawerTarget | null>(null);
  /** Claim facts panel for hub-tracked cards without a file here (dm 103). */
  const [claim_info, set_claim_info] = useState<BoardCard | null>(null);

  const [execute_target, set_execute_target] = useState<{
    filename: string;
    title: string;
    readiness: Readiness | null;
    /** True once the SERVER gate refused (409) — readiness then holds the
     *  authoritative server checks and the next confirm is an override. */
    server_refused?: boolean;
  } | null>(null);
  const [execute_mode, set_execute_mode] = useState<"uat" | "inplace">("uat");
  const [execute_loading, set_execute_loading] = useState(false);
  const [execute_error, set_execute_error] = useState("");
  const [action_error, set_action_error] = useState("");
  const [drag_over, set_drag_over] = useState<BoardColumnId | null>(null);
  const drag_card_ref = useRef<BoardCard | null>(null);

  // Live-duration ticker: one 1s interval while anything is executing so
  // In Progress cards visibly move (the data poll stays at 10s).
  const has_live = cards.some((c) => c.column === "in_progress");
  const [, set_tick] = useState(0);
  useEffect(() => {
    if (!has_live) return;
    const t = setInterval(() => set_tick((n) => (n + 1) % 3600), 1000);
    return () => clearInterval(t);
  }, [has_live]);

  const packages = useMemo(() => {
    const out = new Set<string>();
    for (const c of cards) if (c.package) out.add(c.package);
    return [...out].sort();
  }, [cards]);

  const file_card_count = useMemo(() => cards.filter((c) => c.filename && c.kind).length, [cards]);
  // Chip coverage: exact when the gateway serves list-level metadata
  // (c1090), else grows as the lazy content scan hydrates (#FALLBACK).
  const covered_count = useMemo(
    () => cards.filter((c) => c.filename && c.kind && (card_has_chip_meta(c) || board.metadata[c.filename])).length,
    [cards, board.metadata]
  );

  const facet_labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      if (!c.filename) continue;
      for (const l of chip_labels(c, board.metadata[c.filename])) counts.set(l, (counts.get(l) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [cards, board.metadata]);

  const filtered_cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (package_filter !== "all" && (c.package || "") !== package_filter) return false;
      if (type_filter !== "all" && String(c.task_type || "").toLowerCase() !== type_filter) return false;
      const meta = c.filename ? board.metadata[c.filename] : undefined;
      const labels = chip_labels(c, meta);
      if (label_facet && !labels.includes(label_facet)) return false;
      // Supervision view (c1631/c1634): the room's coordination rows only —
      // operator gates + wave items (wave-* / seat-* labels).
      if (supervision && !labels.some((l) => {
        const v = l.toLowerCase();
        return v === "decision-gate" || v.startsWith("wave-") || v.startsWith("seat-");
      })) {
        return false;
      }
      if (!q) return true;
      const hay = `${c.item_id || ""} ${c.title} ${c.filename || ""} ${c.package || ""} ${c.summary || ""} ${c.exec_status || ""} ${labels.join(" ")} ${
        chip_priority(c, meta) || ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [cards, board.metadata, query, package_filter, type_filter, label_facet, supervision]);

  const by_column = useMemo(() => {
    const out = new Map<BoardColumnId, BoardCard[]>();
    for (const col of BOARD_COLUMNS) out.set(col.id, []);
    for (const c of filtered_cards) out.get(c.column)?.push(c);
    // Priority-first ordering inside file columns (unknown priority last).
    const rank = (c: BoardCard) => {
      const p = c.filename ? chip_priority(c, board.metadata[c.filename]) : null;
      return p ? PRIORITIES.indexOf(p) : PRIORITIES.length;
    };
    for (const [col, list] of out) {
      if (col === "triage" || col === "ready") list.sort((a, b) => rank(a) - rank(b) || (b.item_id || 0) - (a.item_id || 0));
    }
    return out;
  }, [filtered_cards, board.metadata]);

  async function move_card(card: BoardCard, to_kind: "planned" | "proposed"): Promise<void> {
    if (!card.filename || !card.kind || card.kind === "completed") return;
    if (card.kind === to_kind) return;
    set_action_error("");
    try {
      await gateway.backlog_move({ from_kind: card.kind, to_kind, filename: card.filename });
      await board.refresh();
      on_mutated();
    } catch (e: any) {
      set_action_error(String(e?.message || e || "Move failed"));
    }
  }

  async function open_execute(card: BoardCard): Promise<void> {
    if (!card.filename) return;
    // Fetch-on-demand readiness: an unhydrated card must never open a
    // silently gate-less modal (adversarial find). On fetch failure the
    // modal shows the explicit "not evaluated" state.
    let meta = board.metadata[card.filename];
    if (!meta) {
      try {
        const res = await gateway.backlog_content("planned", card.filename);
        meta = parse_work_item_metadata(String(res?.content || ""));
      } catch {
        meta = undefined as any;
      }
    }
    const readiness = meta ? evaluate_readiness({ task_type: card.task_type }, meta) : null;
    set_execute_error("");
    set_execute_mode(default_mode);
    set_execute_target({ filename: card.filename, title: card.title, readiness });
    void pipeline.load_exec_config();
  }

  async function confirm_execute(override?: AgentOverride): Promise<void> {
    if (!execute_target || execute_loading) return;
    set_execute_loading(true);
    set_execute_error("");
    try {
      const cfg = pipeline.exec_cfg || (await pipeline.load_exec_config());
      if (!cfg || cfg.can_execute !== true) {
        set_execute_error(cfg?.runner_error || "Backlog exec is not available on this gateway.");
        return;
      }
      // Server DoR gate (c1140): always dor=check. override=true only when
      // the operator has already SEEN a failing checklist (client-parsed or
      // a prior server refusal) — the "Execute anyway (override)" click is
      // the explicit override, recorded as dor_overridden on the queue.
      const dor_override = Boolean(execute_target.readiness && !execute_target.readiness.ok);
      await gateway.backlog_execute({
        kind: "planned",
        filename: execute_target.filename,
        execution_mode: execute_mode,
        executor: override?.executor,
        target_model: override?.target_model,
        target_reasoning_effort: override?.target_reasoning_effort,
        dor: "check",
        override: dor_override,
      });
      set_execute_target(null);
      await board.refresh();
      on_mutated();
    } catch (e: any) {
      // A structured DoR refusal replaces the checklist with the SERVER's
      // authoritative checks; the next confirm becomes the explicit override.
      const server_readiness = readiness_from_dor_refusal(e);
      if (server_readiness) {
        set_execute_target((cur) => (cur ? { ...cur, readiness: server_readiness, server_refused: true } : cur));
        set_execute_error("");
      } else {
        set_execute_error(String(e?.message || e || "Execute failed"));
      }
    } finally {
      set_execute_loading(false);
    }
  }

  function open_drawer(card: BoardCard): void {
    // HUB-BACKED cards (work:/claim: keys — no gateway file card, dm 110):
    // route by CARD CLASS, never by claim ownership (the old guard let
    // unclaimed work rows fall into a blank drawer with a false "batch
    // execution" message — the audit's second dead end). Ladder: (i) if
    // the row's card path parses, PROBE the gateway for the file (it may
    // live in the served root) and open the REAL drawer on a hit;
    // (ii) else the work-activity panel — discussion + receipts always.
    if (!card.filename && !card.request_id) {
      const probe = parse_card_path(card.card_path);
      if (probe && gateway_connected) {
        void gateway
          .backlog_content(probe.kind as any, probe.filename)
          .then(() => {
            set_drawer_target({
              filename: probe.filename,
              kind: probe.kind as any,
              title: card.title,
              work_id: card.work_id,
              has_live_request: false,
              initial_tab: "spec",
            });
          })
          .catch(() => set_claim_info(card));
        return;
      }
      set_claim_info(card);
      return;
    }
    set_drawer_target({
      filename: card.filename || "",
      kind: (card.kind as any) || null,
      request_id: card.request_id,
      title: card.title,
      work_id: card.work_id,
      has_live_request: card.column === "in_progress" || card.column === "in_review",
      initial_tab: card.column === "in_review" ? "review" : card.column === "in_progress" ? "runs" : "spec",
    });
  }

  const droppable: Record<string, "planned" | "proposed"> = { ready: "planned", triage: "proposed" };

  return (
    <div className="page board_page_root">
      <div className="board_toolbar">
        <input className="board_search" value={query} onChange={(e) => set_query(e.target.value)} placeholder="Search the board…" />
        <select value={package_filter} onChange={(e) => set_package_filter(e.target.value)} title="Package">
          <option value="all">all packages</option>
          {packages.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={type_filter} onChange={(e) => set_type_filter(e.target.value)} title="Type">
          <option value="all">all types</option>
          {WORK_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          className={`chip mono board_facet ${supervision ? "active" : "muted"}`}
          onClick={() => set_supervision((v) => !v)}
          aria-pressed={supervision}
          title="Room supervision: only operator decision gates + wave items (labels decision-gate / wave-* / seat-*)"
        >
          Supervision
        </button>
        <div className="board_toolbar_spacer" />
        {board.degraded && !folder_unavailable ? (
          <span className="mono board_warn" title={board.degraded}>
            partial board
          </span>
        ) : null}
        {board.error && !folder_unavailable ? <span className="mono board_error">{board.error}</span> : null}
        {action_error ? <span className="mono board_error">{action_error}</span> : null}
        <button className={`btn btn_icon ${board.loading ? "is_loading" : ""}`} onClick={() => void board.refresh()} disabled={!gateway_connected || board.loading}>
          {board.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {folder_unavailable ? (
        <BacklogUnavailablePanel
          gateway={gateway}
          surface="the board"
          status={backlog_folder.status}
          legacy={backlog_folder.legacy}
          error={board.unavailable}
          on_changed={() => {
            set_folder_nonce((n) => n + 1);
            void board.refresh();
          }}
        />
      ) : null}
      {board_empty ? <BacklogEmptyState status={backlog_folder.status} on_create={props.on_new_task} /> : null}

      {!folder_unavailable && (facet_labels.length || file_card_count) ? (
        <div className="board_facets">
          <span className="mono muted board_facets_caption">labels:</span>
          {facet_labels.map(([label, count]) => (
            <button
              key={label}
              className={`chip mono board_facet ${label_facet === label ? "active" : "info"}`}
              onClick={() => set_label_facet((cur) => (cur === label ? "" : label))}
              title={`${count} scanned card(s) carry ${label} — click to filter (sprints are labels: sprint-N)`}
            >
              {label} <span className="muted">{count}</span>
            </button>
          ))}
          {label_facet ? (
            <button className="chip mono warn board_facet" onClick={() => set_label_facet("")}>
              clear ✕
            </button>
          ) : null}
          {covered_count < file_card_count ? (
            <span
              className="chip mono warn"
              title="Label chips/filters cover only scanned cards — this gateway does not serve list-level metadata yet (#FALLBACK content scan; exact on gateways ≥ c1090)"
            >
              scanned {covered_count}/{file_card_count}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="board_columns" style={folder_unavailable ? { display: "none" } : undefined}>
        {BOARD_COLUMNS.map((col) => {
          const list = by_column.get(col.id) || [];
          const drop_kind = droppable[col.id];
          return (
            <div
              key={col.id}
              className={`board_column board_column_${col.id} ${drag_over === col.id ? "drag_over" : ""}`}
              onDragOver={(e) => {
                if (!drop_kind || !drag_card_ref.current) return;
                e.preventDefault();
                set_drag_over(col.id);
              }}
              onDragLeave={() => set_drag_over((cur) => (cur === col.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                set_drag_over(null);
                const card = drag_card_ref.current;
                drag_card_ref.current = null;
                if (card && drop_kind) void move_card(card, drop_kind);
              }}
            >
              <div className="board_column_header" title={col.hint}>
                <span className="board_column_title">{col.label}</span>
                <span className="board_column_count mono">{list.length}</span>
              </div>
              <div className="board_column_body">
                {list.map((card) => {
                  // Operator decision gates (c1631): supervisable, never
                  // actionable — no drag, no promote/demote, no Execute.
                  // The operator resolves gates; the board only shows them.
                  const gate = card_is_decision_gate(card, card.filename ? board.metadata[card.filename] : undefined);
                  return (
                    <BoardCardView
                      key={card.key}
                      card={card}
                      metadata={card.filename ? board.metadata[card.filename] : undefined}
                      draggable={!gate && Boolean(card.kind && card.filename && (card.column === "triage" || card.column === "ready"))}
                      on_drag_start={() => {
                        drag_card_ref.current = card;
                      }}
                      on_drag_end={() => {
                        drag_card_ref.current = null;
                        set_drag_over(null);
                      }}
                      on_open={() => open_drawer(card)}
                      on_promote={!gate && col.id === "triage" ? () => void move_card(card, "planned") : undefined}
                      on_demote={!gate && col.id === "ready" ? () => void move_card(card, "proposed") : undefined}
                      on_execute={!gate && col.id === "ready" ? () => void open_execute(card) : undefined}
                      on_follow={card.exec_status === "running" || card.exec_status === "queued" ? () => on_open_executions(card.request_id) : undefined}
                    />
                  );
                })}
                {!list.length ? <div className="board_column_empty mono muted">—</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <ExecuteConfirmModal
        open={Boolean(execute_target)}
        target={execute_target ? { kind: "planned", filename: execute_target.filename, title: execute_target.title } : null}
        execute_mode={execute_mode}
        set_execute_mode={set_execute_mode}
        action_loading={execute_loading}
        action_error={execute_error}
        exec_cfg={pipeline.exec_cfg}
        exec_cfg_loading={pipeline.exec_cfg_loading}
        exec_cfg_error={pipeline.exec_cfg_error}
        executors={executor_registry}
        readiness={execute_target?.readiness ?? null}
        server_refused={execute_target?.server_refused === true}
        show_readiness
        on_open_spec={
          execute_target
            ? () => {
                const t = execute_target;
                set_execute_target(null);
                set_drawer_target({ filename: t.filename, kind: "planned", title: t.title, initial_tab: "spec" });
              }
            : undefined
        }
        on_confirm={(override) => void confirm_execute(override)}
        on_close={() => set_execute_target(null)}
      />

      <WorkItemDrawer
        gateway={gateway}
        can_use_gateway={gateway_connected}
        target={drawer_target}
        on_close={() => set_drawer_target(null)}
        on_mutated={async () => {
          if (drawer_target?.filename && (drawer_target.kind === "proposed" || drawer_target.kind === "planned")) {
            await board.refresh_item_metadata(drawer_target.kind, drawer_target.filename);
          }
          await board.refresh();
          on_mutated();
        }}
        on_open_executions={on_open_executions}
      />

      {/* Work-activity panel (dm 110, supersedes the dm-103 facts-only
          panel): hub-backed cards open discussion + receipts from the
          /work index, with Team deep links — never a "go search" note. */}
      {claim_info ? <WorkActivityPanel card={claim_info} on_close={() => set_claim_info(null)} on_open_team={props.on_open_team} /> : null}
    </div>
  );
}

function BoardCardView(props: {
  card: BoardCard;
  metadata?: import("./board_model").WorkItemMetadata;
  draggable: boolean;
  on_drag_start: () => void;
  on_drag_end: () => void;
  on_open: () => void;
  on_promote?: () => void;
  on_demote?: () => void;
  on_execute?: () => void;
  on_follow?: () => void;
}): React.ReactElement {
  const { card, metadata, draggable, on_drag_start, on_drag_end, on_open, on_promote, on_demote, on_execute, on_follow } = props;
  const priority = chip_priority(card, metadata);
  const gate = card_is_decision_gate(card, metadata);
  const readiness = !gate && metadata ? evaluate_readiness({ task_type: card.task_type }, metadata) : null;
  // Read side is OPEN (c1123): unknown at-rest types render as-written,
  // labeled unknown via the shared chip helpers — never coerced.
  const type = read_task_type(card.task_type);
  const live_ms = card.exec_status === "running" && card.started_at ? Math.max(0, Date.now() - Date.parse(card.started_at)) : null;

  return (
    <div
      className={`board_card ${draggable ? "draggable" : ""} ${gate ? "gate" : ""}`}
      onClick={on_open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          on_open();
        }
      }}
      draggable={draggable}
      onDragStart={draggable ? on_drag_start : undefined}
      onDragEnd={draggable ? on_drag_end : undefined}
    >
      <div className="board_card_title">
        {readiness ? (
          <span
            className={`board_ready_dot ${readiness.ok ? "ok" : "warn"}`}
            title={readiness.ok ? "Definition of Ready: satisfied" : `Not ready: ${readiness.checks.filter((c) => !c.ok).map((c) => c.label).join("; ")}`}
          />
        ) : null}
        <span className="board_card_title_text">{card.title}</span>
      </div>
      <div className="board_card_chips">
        {gate ? (
          <span className="chip mono warn" title="Operator decision gate — resolved by the operator's ruling, never assignable or executable (c1631)">
            ⛬ operator gate
          </span>
        ) : null}
        {card.item_id ? <span className="chip mono muted">#{card.item_id}</span> : null}
        {type && !gate ? (
          <span className={`chip mono ${task_type_chip(type)}`} title={task_type_title(type)}>
            {type}
          </span>
        ) : null}
        {priority ? <span className={`chip mono board_prio_${priority.toLowerCase()}`}>{priority}</span> : null}
        {card.package ? <span className="chip mono muted">{card.package}</span> : null}
        {card.batch_size ? <span className="chip mono info">{card.batch_size} items</span> : null}
        {chip_labels(card, metadata)
          .filter((l) => !gate || l.toLowerCase() !== "decision-gate")
          .slice(0, 3)
          .map((l) => (
            <span key={l} className="chip mono info">
              {l}
            </span>
          ))}
        {card.exec_status ? <span className={`chip mono ${card.exec_status === "failed" ? "danger" : card.exec_status === "awaiting_qa" ? "warn" : "info"}`}>{card.exec_status}</span> : null}
        {live_ms !== null ? <span className="chip mono info">{format_duration_ms(live_ms)}</span> : null}
        {card.recent_failures ? (
          <span className="chip mono danger" title={`${card.recent_failures} recent failed attempt(s) — see the Failed lane`}>
            ⚠ {card.recent_failures}
          </span>
        ) : null}
        {card.target_agent ? <span className="chip mono muted">{card.target_agent}</span> : null}
        {/* SEAT-WORK claim chip (S3 join): who holds the live pointer claim
            and for how long; stale age warns — the S4 render fold's v1
            (full file-unchanged predicate rides the drawer's /work data). */}
        {card.claim_owner
          ? (() => {
              const age = claim_age_label({ owner: card.claim_owner!, started_at: card.claim_started_at }, Date.now());
              return (
                <span
                  className={`chip mono ${age?.stale ? "warn" : "info"}`}
                  title={`Live hub claim${card.work_id ? ` (claim:${card.work_id})` : ""}${age?.stale ? " — stale: claimed long ago with no receipt yet; open to re-claim on the record per the ruled process" : ""}`}
                >
                  ⛏ {card.claim_owner}
                  {age ? ` · ${age.label.replace("claimed ", "")}` : ""}
                </span>
              );
            })()
          : null}
      </div>
      {on_promote || on_demote || on_execute || on_follow ? (
        <div className="board_card_actions" onClick={(e) => e.stopPropagation()}>
          {on_promote ? (
            <button className="btn" onClick={on_promote} title="Move to Ready (planned)">
              → Ready
            </button>
          ) : null}
          {on_execute ? (
            <button className="btn primary" onClick={on_execute}>
              Execute
            </button>
          ) : null}
          {on_demote ? (
            <button className="btn" onClick={on_demote} title="Move back to Triage (proposed)">
              → Triage
            </button>
          ) : null}
          {on_follow ? (
            <button className="btn" onClick={on_follow}>
              Follow live
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
