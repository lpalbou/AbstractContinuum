// AbstractContinuum shell — board-first development console (redesign
// 2026-07, docs/design/redesign_2026_07.md).
//
// Layout: left sidebar nav (Board / Executions / Backlog / Agents / Inbox /
// Services / Settings) + slim header (brand, page title, the UNIFIED
// top-right cluster). Connection/assistant/appearance use the SHARED
// abstractuic surfaces (operator directive 20:02, uic c1648 — continuum is
// the FIRST integrator): useGatewayConnection is the one connection state
// machine (boot probe, auto-open per signed-out episode, sign-out), and
// AfTopBarActions renders the cluster over its phase. The shell owns one
// GatewayClient and the authenticated reachability probe; pages own their
// behavior.
import { useEffect, useMemo, useRef, useState } from "react";

import {
  AfAppearanceDialog,
  AfDrawer,
  AfTopBarActions,
  GatewayConnectModal,
  Icon,
  type IconName,
  useAppearanceSettings,
  useGatewayConnection,
} from "@abstractframework/ui-kit";
import { AssistantPanel } from "@abstractframework/panel-chat";

import { GatewayClient } from "./lib/gateway_client";
import { AgentsPage } from "./ui/agents_page";
import { BacklogBrowserPage } from "./ui/backlog_browser";
import { NewTaskModal } from "./ui/backlog/new_task_modal";
import { ErrorBoundary } from "./ui/error_boundary";
import { BoardPage } from "./ui/board/board_page";
import { ExecutionsPage } from "./ui/executions_page";
import { ProcessesPage } from "./ui/processes_page";
import { ReportInboxPage } from "./ui/report_inbox";
import { SettingsPage, type ContinuumSettings } from "./ui/settings_page";
import { TeamPage } from "./ui/team_page";

type Page = "board" | "executions" | "backlog" | "agents" | "team" | "inbox" | "services" | "settings";

// Icons come from the kit set (our 7 glyphs were absorbed, uic c1239 —
// "settings" landed as "gear" there since the kit name was taken).
const NAV: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "board", label: "Board", icon: "board" },
  { id: "executions", label: "Executions", icon: "playCircle" },
  { id: "backlog", label: "Backlog", icon: "list" },
  { id: "agents", label: "Agents & Entities", icon: "agent" },
  { id: "team", label: "Team", icon: "chat" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "services", label: "Services", icon: "server" },
  { id: "settings", label: "Settings", icon: "gear" },
];

const SETTINGS_KEY = "abstractcontinuum_settings_v1";

function load_settings(): ContinuumSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY) || "{}";
    const parsed = JSON.parse(raw);
    // Tokens never rest client-side (ui-kit connection contract, c1142).
    // Earlier builds persisted a direct-mode bearer here — scrub it so no
    // browser that ever ran the old build keeps a token at rest.
    if (parsed && (parsed.auth_token || parsed.gateway_url)) {
      delete parsed.auth_token;
      delete parsed.gateway_url;
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
      } catch {
        // best-effort scrub; the value is dropped from memory regardless
      }
    }
    return {
      maintenance_ai_provider: String(parsed?.maintenance_ai_provider || ""),
      maintenance_ai_model: String(parsed?.maintenance_ai_model || ""),
      maintenance_ai_reasoning: String(parsed?.maintenance_ai_reasoning || ""),
      backlog_advisor_agent: String(parsed?.backlog_advisor_agent || ""),
      default_execution_mode: parsed?.default_execution_mode === "inplace" ? "inplace" : "uat",
    };
  } catch {
    return { maintenance_ai_provider: "", maintenance_ai_model: "", maintenance_ai_reasoning: "", backlog_advisor_agent: "", default_execution_mode: "uat" };
  }
}

export function App(): React.ReactElement {
  const [page, set_page] = useState<Page>("board");
  /** Board search preset (Team work-id chips: chip click -> Board filtered
   *  to that item; consumed once by BoardPage). */
  const [board_query_preset, set_board_query_preset] = useState<string | null>(null);
  /** Board -> Team focus (dm 110): open a channel scrolled to a citing
   *  message; consumed once by TeamPage. */
  const [team_focus, set_team_focus] = useState<{ channel: string; message_id?: string; seq?: number } | null>(null);
  const [settings, set_settings] = useState<ContinuumSettings>(() => load_settings());
  const [connected, set_connected] = useState(false);
  const [new_task_open, set_new_task_open] = useState(false);
  const [probe_nonce, set_probe_nonce] = useState(0);
  // Unified top-bar state (uic c1648): assistant drawer + appearance dialog.
  const [assistant_open, set_assistant_open] = useState(false);
  const [appearance_open, set_appearance_open] = useState(false);
  const [appearance, set_appearance] = useAppearanceSettings("continuum");
  // Bumped by cross-page mutations (task created, item moved) so the board
  // refreshes without polling storms.
  const [data_nonce, set_data_nonce] = useState(0);
  // Transient shell notice (task created, attachment warnings) — the
  // header modal closes before pages render, so outcomes surface here.
  const [notice, set_notice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  // Executions deep link: "Follow live" preselects the request instead of
  // dropping the operator on an unselected page (adversarial UX find).
  const [executions_focus, set_executions_focus] = useState<string>("");

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => set_notice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // Stale-bundle detector (operator dm 140 class, agora's co-sign): an open
  // tab keeps its JS until reload, and a stale bundle against a newer
  // hub/console wire renders wrongly in ways that read as "the feature is
  // broken" (twice in one day: the morning ratings tab, the evening
  // unified-board tab). The served index.html is no-cache and its module
  // script src carries the content hash — compare ours against the
  // server's on focus + every 5 minutes; mismatch = banner, never silent.
  const [stale_bundle, set_stale_bundle] = useState(false);
  useEffect(() => {
    const own = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src") || "";
    if (!own) return; // dev server (vite) — no hashed bundle, nothing to compare
    let gone = false;
    async function check(): Promise<void> {
      try {
        const r = await fetch("/", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!r.ok) return;
        const html = await r.text();
        const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
        const served = m?.[1] || "";
        // Only flip on a POSITIVE mismatch of two known hashes — a fetch
        // hiccup or an unexpected html shape must never cry wolf.
        if (!gone && served && own && served !== own) set_stale_bundle(true);
      } catch {
        /* transient — next tick */
      }
    }
    const on_focus = (): void => void check();
    window.addEventListener("focus", on_focus);
    const t = setInterval(() => void check(), 5 * 60 * 1000);
    void check();
    return () => {
      gone = true;
      window.removeEventListener("focus", on_focus);
      clearInterval(t);
    };
  }, []);

  function open_executions(request_id?: string): void {
    set_executions_focus(String(request_id || ""));
    set_page("executions");
  }

  // A file dropped OUTSIDE a handled drop zone must never navigate the tab
  // to the file (the browser default) — that is a full app unload, the
  // exact class the operator reported (dm 49: "drag and drop not working";
  // a drop landing outside the old composer-only zone silently navigated).
  // preventDefault on the window default only; zone handlers still run.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types || []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // Keep-alive Team page (adversary F7): TeamPage hosts a live WebSocket,
  // per-channel drafts, filter/AI/expansion state, and the reading position.
  // Unmounting it on every Board↔Team hop killed the socket and reset all
  // of it — pattern-matching the operator's "it reloads" complaint. Once
  // visited it stays mounted and self-hides (the abstractflow drawer
  // keep-alive lesson: components hosting long-running client loops must
  // not be conditionally rendered by the parent).
  const [team_visited, set_team_visited] = useState(false);
  useEffect(() => {
    if (page === "team") set_team_visited(true);
  }, [page]);

  // Root-relative markdown links (adversary F2 — the one click-reachable
  // SPA reload): agent-authored markdown like [x](/anything) rendered no
  // target=_blank, so one click unloaded the whole app to the SPA fallback.
  // Retarget them to a new tab at the shell root; hash links and explicit
  // download/blank anchors keep their default behavior.
  function retarget_root_links(e: React.MouseEvent): void {
    const el = e.target as HTMLElement | null;
    const a = el?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/")) return;
    e.preventDefault();
    window.open(href, "_blank", "noopener");
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable (private mode) - settings stay session-only.
    }
  }, [settings]);

  // Always same-origin: the session proxy holds credentials (HttpOnly
  // cookies) and the vite dev plugin mirrors it in dev. The former
  // direct-mode client (bearer in localStorage) was removed per the
  // connection contract — tokens never rest client-side (c1142).
  const gateway = useMemo(() => new GatewayClient({ base_url: "" }), []);

  // The ONE connection state machine (kit, c1648): boot probe, auto-open
  // per signed-out episode (the 2026-07-12 modal-first ruling now lives in
  // the hook), sign-out with in-flight state. Every status change re-arms
  // the data-plane probe below.
  const conn = useGatewayConnection({
    appName: "AbstractContinuum",
    onStatusChange: () => set_probe_nonce((n) => n + 1),
  });
  const connection = conn.status;

  // Two-strike disconnect (adversary F5): a SINGLE failed probe used to
  // flip `connected` false, which cascaded into the connect modal popping
  // open over whatever the operator was typing plus a layout-shifting
  // banner — for one transient fetch blip. The first failure now schedules
  // one quick re-probe; only a second consecutive failure flips the truth.
  const probe_fail_streak = useRef(0);
  useEffect(() => {
    let stop = false;
    let retry_timer: number | undefined;
    // Immediate probe: the 400ms debounce that used to live here guarded
    // per-keystroke client rebuilds from the direct-mode fields — that
    // mode is gone and the client is a constant, so the delay was pure
    // startup latency (found during the c1208 connect-latency audit).
    void (async () => {
      try {
        // Authenticated reachability probe. /processes, not /runs: the runs
        // listing scans the whole store before applying limit (live-measured
        // 6s at current store size, production drive 2026-07-13), which held
        // the connected flip hostage; /processes is auth-gated, always
        // mounted, and answers in ~100ms (enabled flag conveys manager state).
        await gateway.list_processes();
        if (!stop) {
          probe_fail_streak.current = 0;
          set_connected(true);
        }
      } catch {
        if (stop) return;
        probe_fail_streak.current += 1;
        if (probe_fail_streak.current >= 2) {
          set_connected(false);
        } else {
          retry_timer = window.setTimeout(() => {
            if (!stop) set_probe_nonce((n) => n + 1);
          }, 2000);
        }
      }
    })();
    return () => {
      stop = true;
      if (retry_timer !== undefined) window.clearTimeout(retry_timer);
    };
  }, [gateway, page, probe_nonce]);

  // Composite connection truth: when the probe flips to failing while the
  // session label still says signed-in (expired session), re-check the
  // session so pill and pages cannot contradict for long. useRef, not a
  // memo-as-ref (React may discard memo caches — adversary find).
  const prev_connected = useRef(connected);
  useEffect(() => {
    if (prev_connected.current && !connected && connection?.has_session) {
      void conn.refresh();
    }
    prev_connected.current = connected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connection?.has_session]);

  // Assistant transport (injected — the panel never fetches): continuum's
  // existing gateway advisor agent. Swaps to the shared docs-qa bundle when
  // the gateway ships it (c1648 [1]); the drawer/panel stay byte-identical.
  async function assistant_ask(question: string, ctx: { signal: AbortSignal; history: Array<{ role: string; content: string }> }): Promise<string> {
    const messages = [
      ...ctx.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];
    const res = await gateway.backlog_advisor({ messages, agent: settings.backlog_advisor_agent || null });
    return String(res?.reply || "").trim() || "(the advisor returned an empty reply)";
  }

  return (
    <div className="shell" onClickCapture={retarget_root_links}>
      <aside className="shell_sidebar">
        <div className="shell_brand" title="AbstractContinuum — continuous development console">
          <span className="shell_brand_mark">∞</span>
          <span className="shell_brand_name">Continuum</span>
        </div>
        <nav className="shell_nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`shell_nav_item ${page === item.id ? "active" : ""}`}
              onClick={() => set_page(item.id)}
              title={item.label}
            >
              <span className="shell_nav_icon">
                <Icon name={item.icon} size={16} />
              </span>
              <span className="shell_nav_label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="shell_main">
        <header className="shell_header">
          <div className="shell_header_title">{NAV.find((n) => n.id === page)?.label || ""}</div>
          <div className="shell_header_actions">
            {/* The unified top-right cluster (operator directive 20:02,
                uic c1648): assistant + appearance + app action + the
                three-phase connection pill. */}
            <AfTopBarActions
              assistant={{ open: assistant_open, onToggle: () => set_assistant_open((v) => !v) }}
              appearance={{ onOpen: () => set_appearance_open(true) }}
              extraActions={
                <button className="btn primary" onClick={() => set_new_task_open(true)} disabled={!connected}>
                  + New task
                </button>
              }
              connection={{
                phase: conn.phase,
                signingOut: conn.signingOut,
                onConnect: conn.openModal,
                onDisconnect: () => void conn.signOut(),
              }}
            />
          </div>
        </header>

        {!connected && page !== "settings" ? (
          <div className="shell_banner">
            <span>Gateway unreachable or not signed in.</span>
            <button className="btn" onClick={conn.openModal}>
              Connect
            </button>
          </div>
        ) : null}
        {conn.signOutError ? (
          <div className="shell_banner">
            <span>Sign-out failed: {conn.signOutError} — the session may still be live.</span>
          </div>
        ) : null}

        {notice ? (
          <div className={`shell_banner ${notice.tone === "warn" ? "" : "shell_banner_ok"}`}>
            <span>{notice.text}</span>
            <button className="btn" onClick={() => set_notice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Stale-bundle banner (dm 140 class): this tab's JS predates the
            served build — old code against a newer wire renders wrongly in
            ways that read as broken features. Never dismissible-without-
            action: the only honest cure is the reload. */}
        {stale_bundle ? (
          <div className="shell_banner">
            <span>This tab is running an older build of the console — features may render wrong until you reload.</span>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload now
            </button>
          </div>
        ) : null}

        <main className="shell_content">
          {page === "board" ? (
            <BoardPage
              gateway={gateway}
              gateway_connected={connected}
              data_nonce={data_nonce}
              on_mutated={() => set_data_nonce((n) => n + 1)}
              on_open_executions={open_executions}
              default_execution_mode={settings.default_execution_mode}
              query_preset={board_query_preset}
              on_query_preset_consumed={() => set_board_query_preset(null)}
              on_open_team={(focus) => {
                set_team_focus(focus);
                set_page("team");
              }}
              on_new_task={() => set_new_task_open(true)}
            />
          ) : null}

                {page === "executions" ? (
                  <ExecutionsPage
                    gateway={gateway}
                    gateway_connected={connected}
                    focus_request_id={executions_focus}
                    on_focus_consumed={() => set_executions_focus("")}
                    on_open_settings={() => set_page("settings")}
                  />
                ) : null}

          {page === "backlog" ? (
            <BacklogBrowserPage
              gateway={gateway}
              gateway_connected={connected}
              maintenance_ai_provider={settings.maintenance_ai_provider}
              maintenance_ai_model={settings.maintenance_ai_model}
              maintenance_ai_reasoning={settings.maintenance_ai_reasoning}
              backlog_advisor_agent={settings.backlog_advisor_agent}
              default_execution_mode={settings.default_execution_mode}
              on_open_executions={open_executions}
            />
          ) : null}

                {page === "agents" ? (
                  <AgentsPage
                    gateway={gateway}
                    gateway_connected={connected}
                    backlog_advisor_agent={settings.backlog_advisor_agent}
                    on_open_assistant={() => set_assistant_open(true)}
                    on_open_team={() => set_page("team")}
                    on_open_executions={() => open_executions()}
                  />
                ) : null}

                {/* Keep-alive (F7): mounted once visited, hidden via CSS so
                    the WS + drafts + reading state survive page hops.
                    display:contents when active keeps the flex layout
                    identical to direct child rendering. */}
                {team_visited ? (
                  <div style={{ display: page === "team" ? "contents" : "none" }}>
                    {/* Page-level boundary (operator dm 55/57): a render throw
                        anywhere in the Team page falls back to a recoverable
                        card instead of a blank console. Per-message rows have
                        their own finer boundary inside. */}
                    <ErrorBoundary
                      fallback={(err) => (
                        <div className="page page_pad">
                          <div className="callout callout_warn">
                            <strong>The Team view hit a render error.</strong>
                            <div className="muted" style={{ margin: "6px 0" }}>
                              {String(err.message || err)}
                            </div>
                            <button className="btn" onClick={() => window.location.reload()}>
                              Reload
                            </button>
                          </div>
                        </div>
                      )}
                    >
                      <TeamPage
                      gateway={gateway}
                      gateway_connected={connected}
                      advisor={
                        connected
                          ? async (question, history) => {
                              const messages_payload = [
                                ...history.map((t) => ({ role: t.role, content: t.content })),
                                { role: "user" as const, content: question },
                              ];
                              const res = await gateway.backlog_advisor({
                                messages: messages_payload,
                                agent: settings.backlog_advisor_agent || null,
                              });
                              return String(res?.reply || "").trim() || "(the model returned an empty reply)";
                            }
                          : undefined
                      }
                      advisor_agent={settings.backlog_advisor_agent}
                      on_open_board={(work_id) => {
                        set_board_query_preset(work_id || null);
                        set_page("board");
                      }}
                      focus={team_focus}
                      on_focus_consumed={() => set_team_focus(null)}
                    />
                    </ErrorBoundary>
                  </div>
                ) : null}

          {page === "inbox" ? <ReportInboxPage gateway={gateway} gateway_connected={connected} enable_triage={true} /> : null}

          {page === "services" ? <ProcessesPage gateway={gateway} gateway_connected={connected} /> : null}

          {page === "settings" ? (
            <SettingsPage gateway={gateway} gateway_connected={connected} settings={settings} set_settings={set_settings} connection={connection} />
          ) : null}
        </main>
      </div>

      {/* Modal lifecycle is the hook's (boot-probe seed, auto-open per
          signed-out episode, close-on-connect) — spread its props. */}
      <GatewayConnectModal {...conn.modalProps} />

      <AfDrawer open={assistant_open} onClose={() => set_assistant_open(false)} label="Assistant" title="Continuum assistant">
        <AssistantPanel
          ask={assistant_ask}
          assistantName="Continuum advisor"
          blockedNotice={connected ? undefined : "Connect to the gateway to use the assistant."}
        />
      </AfDrawer>

      <AfAppearanceDialog open={appearance_open} onClose={() => set_appearance_open(false)} value={appearance} onChange={set_appearance} />

      <NewTaskModal
        open={new_task_open}
        gateway={gateway}
        can_use_gateway={connected}
        maint_provider={settings.maintenance_ai_provider}
        maint_model={settings.maintenance_ai_model}
        maint_reasoning={settings.maintenance_ai_reasoning}
        on_close={() => set_new_task_open(false)}
        on_created={async (created_kind, filename, attachment_warning) => {
          set_data_nonce((n) => n + 1);
          // Recurrent items have no board home (ruled Backlog-only) —
          // landing on the board would make the create look like it failed.
          const kind = String(created_kind || "");
          if (kind === "recurrent") set_page("backlog");
          else set_page("board");
          set_notice(
            attachment_warning
              ? { text: `Task created (${filename}), but attachments failed: ${attachment_warning}`, tone: "warn" }
              : { text: `Task created: ${filename} (${kind || "?"})${kind === "recurrent" ? " — recurrent items live on the Backlog page" : ""}`, tone: "ok" }
          );
        }}
      />
    </div>
  );
}
