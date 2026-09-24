// The backlog folder, as the gateway serves it (gateway mission II,
// operator 2026-09-24: "fix continuum for a new fresh install ... no
// environment variables, proper settings"). A fresh gateway uses its own
// folder (<data dir>/backlog, created with a starter overview + template),
// so the Board shows an EMPTY backlog instead of a setup box. What remains:
//
//  - UNAVAILABLE (a saved/launch folder that vanished, or a gateway older
//    than the setting): the path + reason, and for admins two actions over
//    the gateway's settings door — "Use the gateway's own folder" and
//    "Choose a folder…" (validated by the gateway; its refusal shown as is).
//    Non-admins are told who can fix it and where.
//  - EMPTY (folder available, no items): "Your backlog is empty", the folder
//    path with Copy, and "Create your first item" (the New task modal).
//
// Never an environment-variable instruction (operator rule).
import React, { useEffect, useState } from "react";

import { copyText } from "@abstractframework/panel-chat";

import type { BacklogStatusResponse, GatewayClient } from "../lib/gateway_client";

/** True for the gateway's "backlog not usable" 404 class — the new wording
 *  ("Backlog folder not available …") and the pre-setting wording ("Backlog
 *  browsing not configured …") of older gateways. */
export function is_backlog_unavailable(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return /backlog folder not available|backlog browsing not configured/i.test(msg);
}

/** The gateway's own sentence from a client error ("label failed: <detail>"). */
export function gateway_detail(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "").trim();
  return msg.replace(/^[a-z_]+ failed: /, "");
}

export type BacklogStatusState = {
  /** null = not fetched yet, or the gateway predates GET /backlog/status. */
  status: BacklogStatusResponse | null;
  /** True once the gateway answered 404 (older gateway: no status endpoint). */
  legacy: boolean;
};

/** GET /api/gateway/backlog/status, refetched when `nonce` changes. */
export function use_backlog_status(gateway: GatewayClient, connected: boolean, nonce: number): BacklogStatusState {
  const [state, set_state] = useState<BacklogStatusState>({ status: null, legacy: false });
  useEffect(() => {
    if (!connected) return;
    let stale = false;
    void (async () => {
      try {
        const status = await gateway.backlog_status();
        if (!stale) set_state({ status, legacy: false });
      } catch (e: any) {
        // 404 = a gateway older than the backlog-folder setting. Anything
        // else leaves the state unknown (the pages still render their data).
        if (!stale) set_state({ status: null, legacy: Number(e?.status) === 404 });
      }
    })();
    return () => {
      stale = true;
    };
  }, [gateway, connected, nonce]);
  return state;
}

function NonAdminFix(): React.ReactElement {
  return (
    <>
      Ask the gateway admin to set the backlog folder (gateway console → Apps → Backlog settings, or{" "}
      <code className="mono">abstractgateway config set triage_repo_root PATH</code> on the gateway's computer).
    </>
  );
}

/** Unavailable backlog folder: state-driven, admin actions through the
 *  gateway's runtime-config door. */
export function BacklogUnavailablePanel(props: {
  gateway: GatewayClient;
  surface: string;
  status: BacklogStatusResponse | null;
  /** The gateway answered 404 on the status endpoint (older gateway). */
  legacy?: boolean;
  /** The 404 detail that told us (older gateways have no status endpoint). */
  error?: unknown;
  /** Called after a successful change so the page refetches. */
  on_changed?: () => void;
}): React.ReactElement {
  const { gateway, surface, status, legacy, on_changed } = props;
  const [choosing, set_choosing] = useState(false);
  const [path, set_path] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState("");
  const [admin, set_admin] = useState<boolean | null>(status?.writable ?? null);

  // Older gateways have no status endpoint (legacy); their runtime-config
  // read carries `writable` (and is readable by any signed-in user).
  useEffect(() => {
    if (status?.writable !== undefined) {
      set_admin(Boolean(status.writable));
      return;
    }
    if (!legacy) return;
    let stale = false;
    void gateway
      .admin_runtime_config()
      .then((cfg) => {
        if (!stale) set_admin(cfg?.writable === true);
      })
      .catch(() => {
        if (!stale) set_admin(false);
      });
    return () => {
      stale = true;
    };
  }, [gateway, status?.writable, legacy]);

  async function apply(value: string): Promise<void> {
    if (busy) return;
    set_busy(true);
    set_error("");
    try {
      await gateway.admin_runtime_config_update({ triage_repo_root: value });
      set_choosing(false);
      on_changed?.();
    } catch (e) {
      set_error(gateway_detail(e));
    } finally {
      set_busy(false);
    }
  }

  const reason = String(status?.reason || "").trim() || (props.error ? gateway_detail(props.error) : "");
  const default_path = String(status?.default_path || "").trim();
  return (
    <div className="pane setup_callout" data-testid="backlog_unavailable">
      <div className="pane_header">
        <span className="pane_title">This gateway's backlog folder is not available</span>
        <span className="chip mono warn">{surface} has no data</span>
      </div>
      <div className="pane_body">
        <div style={{ fontSize: "var(--font-size-md)" }}>
          {status?.path ? (
            <>
              <code className="mono">{status.path}</code> —{" "}
            </>
          ) : null}
          {reason || "the gateway did not say why."}
        </div>
        {admin === true ? (
          <>
            <div className="callout_actions" style={{ marginTop: "10px" }}>
              {default_path ? (
                <button className="btn primary" disabled={busy} onClick={() => void apply(default_path)} title={default_path}>
                  Use the gateway's own folder
                </button>
              ) : null}
              <button className="btn" disabled={busy} onClick={() => set_choosing((v) => !v)}>
                Choose a folder…
              </button>
            </div>
            {default_path ? (
              <div className="muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
                The gateway's own folder is <code className="mono">{default_path}</code>; it is created with a starter overview and item template.
              </div>
            ) : null}
            {choosing ? (
              <form
                className="field"
                style={{ marginTop: "10px" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (path.trim()) void apply(path.trim());
                }}
              >
                <label htmlFor="backlog_folder_path">Folder on the gateway's computer that contains docs/backlog</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    id="backlog_folder_path"
                    className="mono"
                    value={path}
                    onChange={(e) => set_path(String(e.target.value || ""))}
                    placeholder="/path/to/your/project"
                    autoFocus
                  />
                  <button className="btn primary" type="submit" disabled={busy || !path.trim()}>
                    {busy ? "Saving…" : "Use this folder"}
                  </button>
                </div>
              </form>
            ) : null}
            {error ? (
              <div className="page_error mono" role="alert" style={{ marginTop: "8px" }}>
                {error}
              </div>
            ) : null}
          </>
        ) : admin === false ? (
          <div className="muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
            <NonAdminFix />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Available folder, no items: say so, show where they live, offer the
 *  first one. */
export function BacklogEmptyState(props: { status: BacklogStatusResponse | null; on_create?: () => void }): React.ReactElement {
  const { status, on_create } = props;
  const [copied, set_copied] = useState(false);
  const folder = String(status?.path || "").trim();
  const proposed = folder ? `${folder.replace(/\/+$/, "")}/docs/backlog/proposed/` : "docs/backlog/proposed/";
  const template = folder ? `${folder.replace(/\/+$/, "")}/${status?.template_relpath || "docs/backlog/template.md"}` : status?.template_relpath || "docs/backlog/template.md";
  return (
    <div className="pane setup_callout" data-testid="backlog_empty">
      <div className="pane_header">
        <span className="pane_title">Your backlog is empty</span>
        {status?.is_default ? <span className="chip mono muted">the gateway's own folder</span> : null}
      </div>
      <div className="pane_body">
        {folder ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "var(--font-size-sm)" }}>
              Backlog folder
            </span>
            <code className="mono">{folder}</code>
            <button
              className="btn"
              onClick={() => {
                void copyText(folder);
                set_copied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : null}
        <div className="callout_text" style={{ marginTop: "8px" }}>
          Each item is a Markdown file: new ones land in <code className="mono">{proposed}</code> (Triage), accepted ones move to{" "}
          <code className="mono">planned/</code> (Ready). Start from the template <code className="mono">{template}</code>, or let Continuum
          write it for you.
        </div>
        {on_create ? (
          <div className="callout_actions" style={{ marginTop: "10px" }}>
            <button className="btn primary" onClick={on_create}>
              Create your first item
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
