// Voice settings (operator dm 130): the console reads each message aloud
// through the gateway DEFAULT voice; this panel OVERRIDES it — provider /
// model / base voice / cloned voice / quality — as a browser preference
// (localStorage). The gateway owns the default and the voice catalog;
// this panel only records "when I press speak, use THIS instead" and
// offers a Test button. Feature-detected: an unreachable catalog degrades
// to a labeled note, never dead UI.
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { GatewayClient } from "../lib/gateway_client";
import { session_memory_run_id } from "../lib/session_run_id";
import { load_voice_override, save_voice_override, voice_request_fields, resolve_default_voice_fields, type VoiceOverride } from "../lib/voice_settings";

type Catalog = {
  loading: boolean;
  error: string;
  providers: string[];
  models_by_provider: Record<string, string[]>;
  /** Base/profile voices per provider (engine presets). */
  profiles_by_provider: Record<string, string[]>;
  /** Selectable voices per provider (may include named + cloned). */
  voices_by_provider: Record<string, string[]>;
  /** Cloned voices per provider (backend-specific ids). */
  cloned_by_provider: Record<string, string[]>;
};

const EMPTY_CATALOG: Catalog = { loading: false, error: "", providers: [], models_by_provider: {}, profiles_by_provider: {}, voices_by_provider: {}, cloned_by_provider: {} };

/** Cloned voices per provider from the compact catalog's `items` (adversary
 *  P0-1: `compact=true` drops the `cloned_voices` key, but each item carries
 *  `provider` + `id` + `voice_kinds` including "clone"). */
function cloned_from_items(items: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const kinds = (it as any).voice_kinds;
    const is_clone = Array.isArray(kinds) && kinds.some((k) => String(k).toLowerCase().includes("clone"));
    if (!is_clone) continue;
    const provider = String((it as any).provider || "").trim();
    const id = String((it as any).id || (it as any).voice || (it as any).name || "").trim();
    if (!id) continue;
    const key = provider || "*";
    (out[key] ||= []).push(id);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

function as_string_list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const s = String((item as any).id || (item as any).name || (item as any).voice || (item as any).value || "").trim();
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

function as_map(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const list = as_string_list(val);
      if (list.length) out[String(k)] = list;
    }
  }
  return out;
}

export function VoiceSettingsPanel(props: { gateway: GatewayClient; gateway_connected: boolean }): React.ReactElement {
  const { gateway, gateway_connected } = props;
  const [override, set_override] = useState<VoiceOverride>(() => load_voice_override());
  const [cat, set_cat] = useState<Catalog>(EMPTY_CATALOG);
  const [test_busy, set_test_busy] = useState(false);
  const [test_note, set_test_note] = useState("");
  const audio_ref = useRef<HTMLAudioElement | null>(null);

  // Persist on every change (this browser). storage event wakes the Team
  // page's live copy in other tabs.
  const update = useCallback((patch: Partial<VoiceOverride>) => {
    set_override((cur) => {
      const next = { ...cur, ...patch };
      save_voice_override(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!gateway_connected) {
      set_cat(EMPTY_CATALOG);
      return;
    }
    // Feature-detect the method (older client / test stub) — absence
    // degrades to type-your-own values, never a mount crash.
    if (typeof (gateway as any)?.voice_voices !== "function") {
      set_cat(EMPTY_CATALOG);
      return;
    }
    let alive = true;
    set_cat((c) => ({ ...c, loading: true, error: "" }));
    let p: Promise<any>;
    try {
      p = gateway.voice_voices();
    } catch (e: any) {
      set_cat({ ...EMPTY_CATALOG, error: String(e?.message || e || "voice catalog unavailable") });
      return;
    }
    void p
      .then((payload) => {
        if (!alive) return;
        const providers = [...new Set([...as_string_list(payload?.providers), ...as_string_list(payload?.tts_providers)])];
        set_cat({
          loading: false,
          error: "",
          providers,
          models_by_provider: as_map(payload?.tts_models_by_provider),
          profiles_by_provider: as_map(payload?.tts_profiles_by_provider),
          voices_by_provider: as_map(payload?.tts_voices_by_provider),
          cloned_by_provider: cloned_from_items(payload?.items),
        });
      })
      .catch((e: any) => {
        if (!alive) return;
        set_cat({ ...EMPTY_CATALOG, error: String(e?.message || e || "voice catalog unavailable") });
      });
    return () => {
      alive = false;
    };
  }, [gateway, gateway_connected]);

  const provider = override.provider || "";
  const models = provider && cat.models_by_provider[provider] ? cat.models_by_provider[provider] : [];
  const named_voices = provider && cat.voices_by_provider[provider] ? cat.voices_by_provider[provider] : [];
  const profiles = provider && cat.profiles_by_provider[provider] ? cat.profiles_by_provider[provider] : [];
  // Cloned voices, provider-scoped (adversary P2-5): the picked provider's
  // clones, plus any provider-agnostic ones. The operator asked
  // specifically for cloned-voice selection.
  const clone_options = [...(provider && cat.cloned_by_provider[provider] ? cat.cloned_by_provider[provider] : []), ...(cat.cloned_by_provider["*"] || [])];

  async function run_test(): Promise<void> {
    if (test_busy || !gateway_connected) return;
    set_test_busy(true);
    set_test_note("");
    try {
      const rid = await session_memory_run_id("abstractcontinuum_team_voice");
      // Audition the SAME resolution the message path uses (dm 133):
      // configured default under the override, so "Test" with the override
      // off auditions the operator's real default, not openai.
      let default_fields: { provider?: string; model?: string; voice?: string } = {};
      if (typeof (gateway as any).capability_defaults === "function") {
        try {
          default_fields = resolve_default_voice_fields(await gateway.capability_defaults());
        } catch {
          default_fields = {};
        }
      }
      // Blocking synth for the one-shot Test with a short deadline so a
      // wedged backend fails fast instead of hanging Settings.
      const res = await gateway.voice_tts(rid, {
        text: "This is the voice AbstractContinuum will use to read your messages.",
        ...default_fields,
        ...voice_request_fields(override),
        timeout_s: 30,
      });
      const a = res?.audio_artifact;
      const aid = a && typeof a === "object" ? String((a as any).$artifact || "").trim() : "";
      if (!aid) throw new Error("no audio returned");
      const blob = await gateway.download_run_artifact_content(rid, aid);
      const url = URL.createObjectURL(blob);
      if (audio_ref.current) {
        try {
          audio_ref.current.pause();
        } catch {
          /* ignore */
        }
      }
      const prev = audio_ref.current;
      if (prev) {
        try {
          prev.pause();
        } catch {
          /* ignore */
        }
        const prev_url = prev.src;
        if (prev_url.startsWith("blob:")) URL.revokeObjectURL(prev_url);
      }
      const audio = new Audio(url);
      audio_ref.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        set_test_note("");
      };
      try {
        await audio.play();
        set_test_note("Playing…");
      } catch (play_err: any) {
        // Synthesis succeeded; only playback autostart was refused
        // (adversary P1-2: user-activation can expire across a ~30s synth).
        // Don't mislead the operator that their voice pick is broken.
        set_test_note(String(play_err?.name || "").includes("NotAllowed") ? "Synthesized OK — click Test again to play." : `Playback failed: ${String(play_err?.message || play_err).slice(0, 80)}`);
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      set_test_note(`Test failed: ${String(e?.message || e || "synthesis error").slice(0, 120)}`);
    } finally {
      set_test_busy(false);
    }
  }

  return (
    <div className="pane" style={{ marginTop: 12 }}>
      <div className="pane_header">
        <span className="pane_title">Voice</span>
        <span className="pane_subtitle">message read-aloud — this browser</span>
      </div>
      <div className="pane_body">
        {!gateway_connected ? (
          <div className="muted team_note">Connect to the gateway to configure and test message voice.</div>
        ) : (
          <>
            <p className="muted team_note" style={{ marginTop: 0 }}>
              Each message can be read aloud (the speaker button on a message). By default the gateway&apos;s configured voice is used, streamed so playback starts immediately. Override it here for this browser.
            </p>
            <label className="settings_row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={override.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
              Override the gateway default voice
            </label>

            {cat.error ? <div className="muted team_note">Voice catalog unavailable ({cat.error.slice(0, 100)}) — you can still type provider/model/voice values below; the gateway validates on Test.</div> : null}
            {cat.loading ? <div className="muted team_note">Loading voices…</div> : null}

            {override.enabled && !provider && (override.voice || override.profile) ? (
              <div className="muted team_note" style={{ color: "var(--warning, #facc15)" }}>
                A voice id is provider-specific — pick the provider it belongs to, or the gateway&apos;s default provider may reject it.
              </div>
            ) : null}

            {override.enabled ? (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label className="settings_field">
                  <span className="muted">Provider</span>
                  <ComboSelect value={provider} options={cat.providers} placeholder="gateway default" onChange={(v) => update({ provider: v, model: "", voice: "", profile: "" })} />
                </label>
                <label className="settings_field">
                  <span className="muted">Model</span>
                  <ComboSelect value={override.model || ""} options={models} placeholder="default" onChange={(v) => update({ model: v })} />
                </label>
                <label className="settings_field">
                  <span className="muted">Base voice</span>
                  <ComboSelect value={override.profile || ""} options={profiles} placeholder="default" onChange={(v) => update({ profile: v })} />
                </label>
                <label className="settings_field">
                  <span className="muted">Cloned voice</span>
                  <ComboSelect
                    value={override.voice || ""}
                    options={[...clone_options, ...named_voices]}
                    placeholder="none"
                    onChange={(v) => update({ voice: v })}
                  />
                </label>
              </div>
            ) : null}

            <label className="settings_field" style={{ marginTop: 8 }}>
              <span className="muted">Quality</span>
              <select className="team_compose_control" value={override.quality_preset || ""} onChange={(e) => update({ quality_preset: e.target.value })}>
                <option value="">gateway default</option>
                <option value="low">low (fastest)</option>
                <option value="standard">standard</option>
                <option value="high">high (best)</option>
              </select>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <button className="btn primary" disabled={test_busy} onClick={() => void run_test()}>
                {test_busy ? "Synthesizing…" : "Test voice"}
              </button>
              {test_note ? <span className="muted team_note">{test_note}</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A datalist-backed input: pick from the catalog OR type a value the
 *  catalog doesn't list (a cloned-voice id the discovery lane missed, a
 *  provider-specific model). The gateway validates on Test — the picker
 *  never blocks a valid-but-unlisted value. */
function ComboSelect(props: { value: string; options: string[]; placeholder?: string; onChange: (v: string) => void }): React.ReactElement {
  const id = React.useId();
  return (
    <>
      <input
        className="team_compose_control mono"
        list={id}
        value={props.value}
        placeholder={props.placeholder || ""}
        onChange={(e) => props.onChange(e.target.value.trim())}
      />
      {props.options.length ? (
        <datalist id={id}>
          {props.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
