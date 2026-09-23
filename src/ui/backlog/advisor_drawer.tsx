// Backlog advisor drawer: the edge-mounted toggle + right drawer with a
// read-only advisor chat (agent-backed), local-file attachments, tool-trace
// display, and voice (push-to-talk + TTS). Owns all of its state; the page
// passes the current backlog focus (kind + type filter) for context.
import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChatComposer, ChatThread, type ChatMessage } from "@abstractframework/panel-chat";
import { Icon as UiIcon, useGatewayVoice } from "@abstractframework/ui-kit";

import type { AttachmentRef, GatewayClient } from "../../lib/gateway_client";
import { random_id } from "../../lib/ids";
import { type BacklogTab, type BacklogTaskTypeFilter, session_memory_run_id } from "./model";

export function AdvisorDrawer(props: {
  gateway: GatewayClient;
  can_use_gateway: boolean;
  is_compact_layout: boolean;
  maint_provider: string;
  /** Reasoning effort on the `thinking` wire key ("" = gateway default). */
  maint_reasoning?: string;
  maint_model: string;
  advisor_agent: string;
  focus_kind: BacklogTab;
  focus_type: BacklogTaskTypeFilter;
  voice_session_id?: string;
}): React.ReactElement {
  const { gateway, can_use_gateway, is_compact_layout, maint_provider, maint_model, maint_reasoning, advisor_agent, focus_kind, focus_type } = props;

  const [advisor_open, set_advisor_open] = useState(false);
  const [advisor_messages, set_advisor_messages] = useState<ChatMessage[]>([]);
  const [advisor_input, set_advisor_input] = useState("");
  const [advisor_loading, set_advisor_loading] = useState(false);
  const [advisor_error, set_advisor_error] = useState("");
  const [advisor_show_tools, set_advisor_show_tools] = useState(false);
  const [advisor_recent_attachments, set_advisor_recent_attachments] = useState<string[]>([]);
  const advisor_input_ref = useRef<HTMLTextAreaElement | null>(null);
  const advisor_attach_input_ref = useRef<HTMLInputElement | null>(null);

  const advisor_voice_session_id = String(props.voice_session_id || "").trim() || "abstractcontinuum_backlog_advisor";
  const [advisor_voice_run_id, set_advisor_voice_run_id] = useState<string>("");
  const [advisor_voice_error, set_advisor_voice_error] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const rid = await session_memory_run_id(advisor_voice_session_id);
        set_advisor_voice_run_id(rid);
      } catch {
        set_advisor_voice_run_id("");
      }
    })();
  }, [advisor_voice_session_id]);

  // Kit voice hook (absorbed from the app copies, uic c1239): the two
  // gateway calls arrive as INJECTED closures over our client, so the kit
  // stays transport-free. The session/run guards that used to live inside
  // the hook now live here — thrown errors surface through on_error.
  const voice_transports = useMemo(() => {
    if (!can_use_gateway) return {};
    const run_id = String(advisor_voice_run_id || "").trim();
    const session_id = advisor_voice_session_id;
    return {
      tts: async (text: string): Promise<ArrayBuffer> => {
        if (!run_id) throw new Error("Voice store not available (missing run_id).");
        const res = await gateway.voice_tts(run_id, { text, request_id: random_id() });
        const a = res?.audio_artifact;
        const aid = a && typeof a === "object" && !Array.isArray(a) ? String((a as any).$artifact || "").trim() : "";
        if (!aid) throw new Error("TTS failed: missing audio artifact");
        const blob = await gateway.download_run_artifact_content(run_id, aid);
        return await blob.arrayBuffer();
      },
      transcribe: async (blob: Blob, mime: string): Promise<string> => {
        if (!run_id) throw new Error("Voice input unavailable (missing run_id).");
        const mime_lc = String(mime || blob.type || "").toLowerCase();
        const ext = mime_lc.includes("mp4") ? "m4a" : mime_lc.includes("ogg") ? "ogg" : mime_lc.includes("wav") ? "wav" : "webm";
        const file = new File([blob], `recording.${ext}`, { type: mime_lc || "audio/webm" });
        const attachment: AttachmentRef = await gateway.attachments_upload(session_id, file, { filename: file.name, content_type: file.type });
        const res = await gateway.audio_transcribe(run_id, { audio_artifact: attachment, request_id: random_id() });
        return String(res?.text || "").trim();
      },
    };
  }, [can_use_gateway, gateway, advisor_voice_run_id, advisor_voice_session_id]);

  const advisor_voice = useGatewayVoice({
    ...voice_transports,
    on_error: set_advisor_voice_error,
    on_transcript: (text) => {
      const t = String(text || "").trim();
      if (!t) return;
      set_advisor_input((prev) => {
        const cur = String(prev || "");
        if (!cur.trim()) return t;
        return `${cur.trimEnd()}\n${t}`;
      });
      window.setTimeout(() => advisor_input_ref.current?.focus(), 0);
    },
  });

  useEffect(() => {
    if (!advisor_open) return;
    const on_keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Same teardown as backdrop/Close: Escape must not leave TTS
        // playing or a PTT recording running behind a closed drawer
        // (adversarial P2 2026-07-13).
        stop_advisor_voice();
        set_advisor_open(false);
      }
    };
    window.addEventListener("keydown", on_keydown);
    // Focus the input (best-effort).
    setTimeout(() => advisor_input_ref.current?.focus(), 0);
    return () => window.removeEventListener("keydown", on_keydown);
  }, [advisor_open]);

  async function send_advisor(): Promise<void> {
    if (advisor_loading) return;
    if (!can_use_gateway) return;
    if (advisor_voice.voice_ptt_busy) {
      set_advisor_voice_error("Wait for transcription to finish.");
      return;
    }
    set_advisor_error("");
    set_advisor_voice_error("");
    const msg = advisor_input.trim();
    if (!msg) return;
    const user_msg: ChatMessage = { id: random_id(), role: "user", content: msg, ts: new Date().toISOString() };
    const next_msgs = [...advisor_messages, user_msg];
    set_advisor_messages(next_msgs);
    set_advisor_input("");
    set_advisor_loading(true);
    try {
      const out = await gateway.backlog_advisor({
        messages: next_msgs.map((m) => ({ role: m.role, content: m.content })),
        provider: maint_provider || null,
        model: maint_model || null,
        thinking: maint_reasoning || null,
        agent: advisor_agent || null,
        include_trace: advisor_show_tools,
        focus_kind,
        focus_type,
      });
      const tool_trace = advisor_show_tools && Array.isArray((out as any)?.tool_trace) ? ((out as any).tool_trace as any[]) : [];
      const run_id = String((out as any)?.run_id || "").trim();
      const reply = String(out?.reply || "").trim();
      if (advisor_show_tools && tool_trace.length) {
        const trace_msg: ChatMessage = {
          id: random_id(),
          role: "system",
          title: "Tool execution",
          level: "info",
          ts: new Date().toISOString(),
          content: JSON.stringify({ run_id: run_id || null, tool_trace }, null, 2),
        };
        set_advisor_messages((ms) => [...ms, trace_msg]);
      }
      if (reply) set_advisor_messages((ms) => [...ms, { id: random_id(), role: "assistant", content: reply, ts: new Date().toISOString() }]);
    } catch (e: any) {
      set_advisor_error(String(e?.message || e || "Backlog advisor failed"));
    } finally {
      set_advisor_loading(false);
    }
  }

  async function attach_advisor_files(files: File[]): Promise<void> {
    const list = Array.from(files || []);
    if (!list.length) return;

    const chunks: string[] = [];
    const picked: string[] = [];
    const max_files = 6;
    const max_chars_per_file = 20_000;
    for (const f of list.slice(0, max_files)) {
      const name = String(f?.name || "").trim() || "attachment";
      picked.push(name);
      try {
        const raw = await f.text();
        const text = raw.length > max_chars_per_file ? `${raw.slice(0, max_chars_per_file)}\n…(truncated)…\n` : raw;
        chunks.push(`[attached file: ${name}]\n\n\`\`\`\n${text}\n\`\`\``);
      } catch {
        chunks.push(`[attached file: ${name}] (unreadable in browser)`);
      }
    }

    set_advisor_recent_attachments((prev) => [...picked, ...prev].slice(0, 12));
    set_advisor_input((prev) => {
      const base = String(prev || "").trim();
      const addition = chunks.join("\n\n");
      return base ? `${base}\n\n${addition}` : addition;
    });

    try {
      advisor_input_ref.current?.focus();
    } catch {
      // ignore
    }
  }

  function toggle_advisor_tts(m: ChatMessage): void {
    const key = String(m.id || m.ts || "").trim();
    const text = String(m.content || "").trim();
    if (!key || !text) return;
    set_advisor_voice_error("");
    void advisor_voice.toggle_tts(key, text);
  }

  function advisor_tts_state_for(m: ChatMessage): "idle" | "loading" | "playing" | "paused" {
    const key = String(m.id || m.ts || "").trim();
    const cur = advisor_voice.tts_playback;
    if (!key || !cur.key || cur.key !== key) return "idle";
    return cur.status;
  }

  function stop_advisor_voice(): void {
    advisor_voice.stop_voice_ptt_recording();
    advisor_voice.stop_tts();
  }

  return (
    <>
      <button
        className={`advisor_toggle ${advisor_open ? "open" : ""}`}
        onClick={() => {
          set_advisor_open((v) => {
            const next = !v;
            if (!next) {
              stop_advisor_voice();
            }
            return next;
          });
        }}
        title="Open backlog advisor (read-only)"
        aria-label="Open backlog advisor"
      >
        <span className="advisor_toggle_label">Advisor</span>
      </button>

      {advisor_open ? (
        <div
          className="drawer_backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              stop_advisor_voice();
              set_advisor_open(false);
            }
          }}
        >
          <div className="drawer_panel">
            <div className="drawer_header">
              <div className="col" style={{ gap: 2 }}>
                <div className="drawer_title">Backlog advisor</div>
                <div className="mono muted" style={{ fontSize: "var(--font-size-xs)" }}>
                  Read-only. Agent: {advisor_agent || "basic-agent"} • Using: {maint_provider || "(gateway default)"} / {maint_model || "(gateway default)"}
                </div>
              </div>
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button
                  className={`btn btn_icon ${advisor_show_tools ? "primary" : ""}`}
                  onClick={() => set_advisor_show_tools((v) => !v)}
                  disabled={advisor_loading}
                  title={advisor_show_tools ? "Hide tool execution" : "Show tool execution"}
                  aria-label={advisor_show_tools ? "Hide tool execution" : "Show tool execution"}
                >
                  <UiIcon name="terminal" size={16} />
                  {is_compact_layout ? null : advisor_show_tools ? "Tools on" : "Tools"}
                </button>
                <button className="btn" onClick={() => set_advisor_messages([])} disabled={advisor_loading || !advisor_messages.length}>
                  Clear
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    stop_advisor_voice();
                    set_advisor_open(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="drawer_body">
              <ChatThread
                messages={advisor_messages}
                className="drawer_chat_thread"
                messageProps={
                  advisor_voice.tts_supported && can_use_gateway && Boolean(advisor_voice_run_id.trim())
                    ? {
                        onSpeakToggle: toggle_advisor_tts,
                        getSpeakState: advisor_tts_state_for,
                        jsonCollapseAfterDepth: 4,
                      }
                    : { jsonCollapseAfterDepth: 4 }
                }
                empty={
                  <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
                    Ask about the backlog, e.g. “What are the top 5 planned items to focus on next and why?”
                  </div>
                }
              />

              <div className="drawer_footer">
                <input
                  ref={advisor_attach_input_ref}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.currentTarget.files || []);
                    e.currentTarget.value = "";
                    if (!files.length) return;
                    void attach_advisor_files(files);
                  }}
                />
                <ChatComposer
                  ref={advisor_input_ref}
                  value={advisor_input}
                  onChange={set_advisor_input}
                  onSubmit={() => void send_advisor()}
                  placeholder="Message to backlog advisor…"
                  disabled={!can_use_gateway}
                  busy={advisor_loading || advisor_voice.voice_ptt_busy}
                  rows={3}
                  sendButtonClassName="btn primary"
                  busyLabel={advisor_voice.voice_ptt_busy ? "Transcribing…" : "Thinking…"}
                  actions={
                    <>
                      <button
                        className={`btn btn_icon voice_btn${advisor_voice.voice_ptt_recording ? " danger" : ""}`}
                        type="button"
                        disabled={
                          !can_use_gateway ||
                          !advisor_voice_run_id.trim() ||
                          advisor_loading ||
                          advisor_voice.voice_ptt_busy ||
                          !advisor_voice.voice_ptt_supported
                        }
                        title={
                          !advisor_voice.voice_ptt_supported
                            ? "Voice recording is not supported in this browser"
                            : advisor_voice.voice_ptt_busy
                              ? "Transcribing…"
                              : advisor_voice.voice_ptt_recording
                                ? "Recording… release to transcribe"
                                : "Hold to talk (record + transcribe)"
                        }
                        aria-label="Voice input"
                        onPointerDown={(e) => {
                          if (
                            !can_use_gateway ||
                            !advisor_voice_run_id.trim() ||
                            advisor_loading ||
                            advisor_voice.voice_ptt_busy ||
                            !advisor_voice.voice_ptt_supported
                          )
                            return;
                          e.preventDefault();
                          try {
                            (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
                          } catch {
                            // ignore
                          }
                          void advisor_voice.start_voice_ptt_recording();
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          advisor_voice.stop_voice_ptt_recording();
                        }}
                        onPointerCancel={(e) => {
                          e.preventDefault();
                          advisor_voice.stop_voice_ptt_recording();
                        }}
                      >
                        <UiIcon name={advisor_voice.voice_ptt_recording ? "x" : "mic"} size={16} />
                        {is_compact_layout ? null : advisor_voice.voice_ptt_busy ? "Transcribing…" : advisor_voice.voice_ptt_recording ? "Recording…" : "Voice"}
                      </button>
                      <button
                        className="btn btn_icon"
                        type="button"
                        onClick={() => advisor_attach_input_ref.current?.click()}
                        disabled={advisor_loading}
                        title="Attach a local file to your message"
                        aria-label="Attach file"
                      >
                        <UiIcon name="paperclip" size={16} />
                        {is_compact_layout ? null : "Attach"}
                      </button>
                    </>
                  }
                />
                {advisor_recent_attachments.length ? (
                  <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "6px" }}>
                    Last attached: {advisor_recent_attachments[0]}
                  </div>
                ) : null}
                {advisor_error ? (
                  <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                    {advisor_error}
                  </div>
                ) : null}
                {advisor_voice_error ? (
                  <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                    {advisor_voice_error}
                  </div>
                ) : null}
                {!can_use_gateway ? (
                  <div className="mono muted" style={{ fontSize: "var(--font-size-sm)", marginTop: "8px" }}>
                    Connect the gateway in Settings to use the advisor.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
