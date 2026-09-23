// Per-entity Skills management panel (framework dispatch c3038, ask 2:
// the console half of the skills UI wave — the entity app's Settings tab
// is the other front door; both render the gateway's ONE resolved truth).
//
// Shape: GET /entities/{name}/skills -> {selection, resolved, matrix};
// the kit's PhaseCapabilityMatrix renders the matrix payload and mints
// cell patches; Save folds payload+patches into the WHOLE-DOCUMENT
// selection (fold_selection, pinned) and PUTs it — the response is the
// fresh resolved view, so verdicts (blocked / requires_review / typo'd
// name) are visible the moment they are written.
import React, { useCallback, useEffect, useState } from "react";

import { type MatrixCellPatch, PhaseCapabilityMatrix } from "@abstractframework/ui-kit";

import type { GatewayClient } from "../lib/gateway_client";
import { fold_selection } from "../lib/entity_skills_model";

type SkillsView = { selection?: any; resolved?: any; matrix?: unknown };

export function EntitySkillsPanel(props: { gateway: GatewayClient; entity_name: string; on_close: () => void }): React.ReactElement {
  const { gateway, entity_name } = props;
  const [view, set_view] = useState<SkillsView | null>(null);
  const [load_error, set_load_error] = useState("");
  const [loading, set_loading] = useState(false);
  const [patches, set_patches] = useState<MatrixCellPatch[]>([]);
  const [saving, set_saving] = useState(false);
  const [save_error, set_save_error] = useState("");
  const [notice, set_notice] = useState("");

  const load = useCallback(async () => {
    set_loading(true);
    set_load_error("");
    try {
      set_view(await gateway.entity_skills(entity_name));
    } catch (e: any) {
      set_view(null);
      set_load_error(String(e?.message || e));
    } finally {
      set_loading(false);
    }
  }, [gateway, entity_name]);

  useEffect(() => {
    set_patches([]);
    set_notice("");
    set_save_error("");
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!view?.matrix) return;
    const selection = fold_selection(view.matrix, patches);
    if (selection === null) {
      set_save_error("Cannot serialize the selection: the matrix payload failed validation — refresh and retry.");
      return;
    }
    set_saving(true);
    set_save_error("");
    try {
      const res = await gateway.put_entity_skills(entity_name, selection);
      set_view(res);
      set_patches([]);
      set_notice("Selection saved — recorded as a host marker on the entity's stream.");
      setTimeout(() => set_notice(""), 5000);
    } catch (e: any) {
      // The write is validate-before-marker on the gateway: a 400 names
      // the offending entry verbatim — render it, never paraphrase.
      set_save_error(String(e?.message || e));
    } finally {
      set_saving(false);
    }
  }

  const warnings: string[] = Array.isArray(view?.selection?.warnings) ? view!.selection.warnings.map(String) : [];
  const resolved_rows: any[] = Array.isArray(view?.resolved?.skills) ? view!.resolved.skills : [];

  return (
    <div className="entity_skills_panel">
      <div className="entity_skills_head">
        <span className="pane_title">Skills — {entity_name}</span>
        <span className="muted" style={{ fontSize: "var(--font-size-xs)" }}>
          what this mind is taught, per phase; the trust gate resolves server-side
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button className="btn" onClick={() => void load()} disabled={loading || saving} title="Reload the resolved view (discards pending edits)">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn" onClick={props.on_close}>
            Close
          </button>
        </span>
      </div>

      {load_error ? <div className="page_error">Skills unavailable: {load_error}</div> : null}
      {warnings.length ? (
        <div className="detail_warn" style={{ marginTop: 4 }}>
          {warnings.join(" · ")}
        </div>
      ) : null}

      {/* Resolved verdicts: active teachings and gate refusals at a glance —
          the matrix below is the editing surface. */}
      {resolved_rows.length ? (
        <div className="entity_skills_resolved">
          {resolved_rows.map((row) => {
            const name = String(row?.name || "");
            const active = Boolean(row?.active);
            const blocked = Boolean(row?.blocked);
            const review = Boolean(row?.requires_review);
            // requires_unmet (skill-0008 consumer contract, gateway c3964):
            // a selected skill whose declared deps (requires_mcp /
            // requires_tools) the gateway could not verify DROPS from
            // active with a structured verdict — render it as its own
            // amber state, never a bare "inactive". Tolerant shape:
            // absent on pre-0008 gateways (chips render as before), list
            // or map when present; the title carries the verdicts
            // VERBATIM (consumers needing the cause read the map — the
            // semantics c3965 contract line).
            const unmet_raw = (row as any)?.requires_unmet;
            const unmet: string[] = Array.isArray(unmet_raw)
              ? unmet_raw.map(String)
              : unmet_raw && typeof unmet_raw === "object"
                ? Object.entries(unmet_raw).map(([k, v]) => `${k}: ${String(v)}`)
                : [];
            const tone = active ? "ok" : blocked ? "danger" : unmet.length ? "warn" : review ? "warn" : "muted";
            const label = active ? "active" : blocked ? "blocked" : unmet.length ? "requires unmet" : review ? "requires review" : "inactive";
            const reasons = [...(Array.isArray(row?.reasons) ? row.reasons.map(String) : []), ...unmet].join("; ");
            return (
              <span key={name} className={`chip mono ${tone}`} title={reasons || undefined}>
                {name} · {label}
              </span>
            );
          })}
        </div>
      ) : null}

      <PhaseCapabilityMatrix
        payload={view?.matrix}
        patches={patches}
        onPatchesChange={set_patches}
        disabled={saving || loading}
        title="Phase capabilities"
        subtitle="Grant/Deny per phase; Default clears the operator word (unselected). Save replaces the whole selection."
      />

      <div className="entity_skills_actions">
        <button className="btn primary" onClick={() => void save()} disabled={saving || !patches.length} title={patches.length ? `Save ${patches.length} pending change(s)` : "No pending changes"}>
          {saving ? "Saving…" : patches.length ? `Save ${patches.length} change${patches.length > 1 ? "s" : ""}` : "Save"}
        </button>
        {patches.length ? (
          <button className="btn" onClick={() => set_patches([])} disabled={saving}>
            Discard edits
          </button>
        ) : null}
        {save_error ? <span className="page_error" style={{ margin: 0 }}>{save_error}</span> : null}
        {notice ? <span className="chip mono ok">{notice}</span> : null}
      </div>
    </div>
  );
}
