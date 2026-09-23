// Work-activity panel (operator dm 110: every board card opens REAL
// content). For hub-backed cards this is the guaranteed floor: the work
// row's facts plus the hub's /work activity index — claims, decisions,
// and every citing MESSAGE (the discussion + receipts lane) with deep
// links into the Team page. Degradation contract (adversarial design
// c-audit): the panel renders SOMETHING in every branch — row facts need
// no fetch; /work absence renders a labeled note + the Team-thread
// button. A "go search" sentence is banned; a "go there" button is the
// floor.
import React, { useEffect, useState } from "react";

import { HubClient } from "../../lib/hub_client";
import { claim_age_label, parse_work_id } from "../../lib/work_id";
import type { BoardCard } from "./board_model";

export type TeamFocus = { channel: string; message_id?: string; seq?: number };

// ADR-0026 §1: activity rows preview agent messages. Bounded for the row, but
// never silently — a bare cut reads as the whole message, and "open ↗" is the
// only path to the rest. [#TRUNCATION] activity-row preview bound.
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

type Activity = {
  loading: boolean;
  error: string;
  claims: any[];
  decisions: any[];
  messages: any[];
};

const hub = new HubClient();

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function WorkActivityPanel(props: { card: BoardCard; on_close: () => void; on_open_team?: (focus: TeamFocus) => void }): React.ReactElement {
  const { card } = props;
  const id = card.work_id || "";
  const parseable = Boolean(id && parse_work_id(id));
  const [act, set_act] = useState<Activity>({ loading: parseable, error: "", claims: [], decisions: [], messages: [] });

  useEffect(() => {
    let alive = true;
    if (!parseable) return;
    set_act((a) => ({ ...a, loading: true, error: "" }));
    hub
      .work(id)
      .then((res) => {
        if (!alive) return;
        set_act({
          loading: false,
          error: "",
          claims: Array.isArray(res?.claims) ? res!.claims! : [],
          decisions: Array.isArray(res?.decisions) ? res!.decisions! : [],
          messages: (Array.isArray(res?.messages) ? res!.messages! : []).slice().sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0)),
        });
      })
      .catch((e: any) => {
        if (!alive) return;
        // Feature-absent hub or transient failure: the row facts below
        // still render; the note names the gap honestly.
        set_act({ loading: false, error: String(e?.message || e || "activity unavailable"), claims: [], decisions: [], messages: [] });
      });
    return () => {
      alive = false;
    };
  }, [id, parseable]);

  const latest = act.messages[0];
  const age = card.claim_started_at !== undefined && card.claim_owner ? claim_age_label({ owner: card.claim_owner, started_at: card.claim_started_at }, Date.now()) : null;

  return (
    <div className="modal_backdrop" onClick={props.on_close}>
      <div className="modal_panel board_claim_panel board_activity_panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal_head">
          <span className="modal_title">{card.title}</span>
          <button className="btn" onClick={props.on_close}>
            Close
          </button>
        </div>

        <div className="board_claim_facts">
          {id ? (
            <div>
              <span className="muted">work id:</span> <span className="mono">{id}</span>
            </div>
          ) : null}
          {card.claim_owner ? (
            <div>
              <span className="muted">{card.column === "done" ? "completed by:" : "held by:"}</span> {card.claim_owner}
              {age ? <span className="muted"> · {age.label}</span> : null}
            </div>
          ) : null}
          {card.summary ? (
            <div>
              <span className="muted">receipt:</span> {card.summary}
            </div>
          ) : null}
          {card.card_path ? (
            <div>
              <span className="muted">item file:</span> <span className="mono">{card.card_path}</span>
              <span className="muted"> (in {card.package || "its own"}'s repository)</span>
            </div>
          ) : null}
        </div>

        {/* Discussion + receipts: the hub /work index. */}
        <div className="board_activity_section">
          <div className="muted team_note" style={{ marginBottom: 4 }}>
            Discussion & receipts {act.loading ? "· loading…" : act.messages.length ? `· ${act.messages.length} citing message(s)` : ""}
          </div>
          {act.error ? <div className="muted team_note">#FALLBACK hub activity unavailable ({act.error.slice(0, 80)}) — the Team thread button below still works.</div> : null}
          {!act.loading && !act.error && parseable && !act.messages.length ? <div className="muted team_note">No citing messages on the hub yet.</div> : null}
          {!parseable ? <div className="muted team_note">This claim has no ruled work id — discussion lives in the coordination channel.</div> : null}
          {act.messages.slice(0, 8).map((m: any) => (
            <div key={m.id || m.seq} className="board_activity_msg">
              <div className="board_activity_msg_head mono">
                <span>{m.sender}</span>
                <span className="muted">
                  {m.channel} #{m.seq} · {ago(m.created_at)}
                </span>
                {props.on_open_team ? (
                  <button
                    className="team_row_expand"
                    onClick={() => props.on_open_team!({ channel: String(m.channel || ""), message_id: String(m.id || ""), seq: Number(m.seq) })}
                    title="Open this message in its Team channel"
                  >
                    open ↗
                  </button>
                ) : null}
              </div>
              {m.title ? <div className="board_activity_msg_title">{clip(String(m.title), 140)}</div> : null}
              {m.body ? <div className="board_activity_msg_body muted">{clip(String(m.body), 220)}</div> : null}
            </div>
          ))}
        </div>

        <div className="entity_skills_actions">
          {props.on_open_team ? (
            <button
              className="btn primary"
              onClick={() =>
                props.on_open_team!(
                  latest ? { channel: String(latest.channel || "commons"), message_id: String(latest.id || ""), seq: Number(latest.seq) } : { channel: "commons" }
                )
              }
              title={latest ? "Open the most recent citing message in its channel" : "Open the coordination channel"}
            >
              Open discussion in Team
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
