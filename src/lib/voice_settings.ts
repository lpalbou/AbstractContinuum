// Voice override settings (operator dm 130): each message is readable by
// the gateway DEFAULT voice with streaming playback; Settings can OVERRIDE
// the provider / model / base voice / cloned voice per this browser. The
// override is a browser preference (localStorage), never server state —
// the gateway owns the default; this only says "when I press speak, use
// THIS instead". Empty/absent fields fall through to the gateway default.

export type VoiceOverride = {
  /** Off = the gateway default voice (no override fields sent). */
  enabled: boolean;
  provider?: string;
  model?: string;
  /** Base/profile voice for the engine (e.g. a named preset). */
  profile?: string;
  /** Cloned-voice selector (backend-specific id). */
  voice?: string;
  /** low | standard | high (synthesis speed/quality tradeoff). */
  quality_preset?: string;
};

const STORAGE_KEY = "abstractcontinuum_voice_override_v1";

export const EMPTY_VOICE_OVERRIDE: VoiceOverride = { enabled: false };

/** Load the persisted override (this browser). Never throws — a corrupt or
 *  absent value degrades to the gateway default. */
export function load_voice_override(): VoiceOverride {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_VOICE_OVERRIDE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_VOICE_OVERRIDE };
    return {
      enabled: Boolean(parsed.enabled),
      provider: str(parsed.provider),
      model: str(parsed.model),
      profile: str(parsed.profile),
      voice: str(parsed.voice),
      quality_preset: str(parsed.quality_preset),
    };
  } catch {
    return { ...EMPTY_VOICE_OVERRIDE };
  }
}

/** Fired in the SAME tab when the override changes (adversary P0-2): the
 *  `storage` event is cross-tab only, and the Team page stays mounted
 *  while Settings edits localStorage in the same tab — without this the
 *  operator's new voice never applies until reload. */
export const VOICE_OVERRIDE_EVENT = "abstractcontinuum:voice_override_changed";

export function save_voice_override(v: VoiceOverride): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage unavailable (private mode / quota) — the in-memory value
    // still drives this session; nothing to surface.
  }
  try {
    window.dispatchEvent(new CustomEvent(VOICE_OVERRIDE_EVENT));
  } catch {
    // non-browser tests
  }
}

/** The synthesis fields to send for a speak request, or {} when the
 *  override is off (gateway default). quality_preset rides even when the
 *  override is disabled IF explicitly set — speed is a default-voice knob
 *  too — but only provider/model/profile/voice gate on `enabled`. */
export function voice_request_fields(v: VoiceOverride | null | undefined): {
  provider?: string;
  model?: string;
  profile?: string;
  voice?: string;
  quality_preset?: string;
} {
  if (!v) return {};
  const out: Record<string, string> = {};
  const qp = str(v.quality_preset);
  if (qp) out.quality_preset = qp;
  if (!v.enabled) return out; // default voice, optional quality only
  for (const k of ["provider", "model", "profile", "voice"] as const) {
    const s = str(v[k]);
    if (s) out[k] = s;
  }
  return out;
}

function str(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

/** The operator's CONFIGURED default TTS voice fields, resolved from the
 *  gateway capability-defaults payload (operator incident dm 133). A bare
 *  voice request does NOT inherit this server-side — the runtime's TTS
 *  stream lane never merges output.voice defaults, so an override-off
 *  request fell through to abstractvoice's hardcoded openai default and
 *  429'd. The console must send the configured default EXPLICITLY. Reads
 *  the first `configured` row keyed output.voice.tts then output.voice;
 *  returns {} when nothing is configured (NEVER fabricates a selection —
 *  the 2026-07-17 combo-fabrication lesson; empty = let the gateway
 *  resolve, which is only correct once the runtime debt is fixed). */
export function resolve_default_voice_fields(payload: unknown): { provider?: string; model?: string; voice?: string } {
  const routes = payload && typeof payload === "object" ? (payload as any).routes : null;
  if (!Array.isArray(routes)) return {};
  const by_key = (key: string) =>
    routes.find((r) => r && typeof r === "object" && String((r as any).key || "").trim() === key && Boolean((r as any).configured));
  const row = by_key("output.voice.tts") || by_key("output.voice");
  if (!row) return {};
  const out: { provider?: string; model?: string; voice?: string } = {};
  const provider = str((row as any).provider);
  const model = str((row as any).model);
  const opts = (row as any).options;
  const voice = opts && typeof opts === "object" ? str((opts as any).voice) : undefined;
  if (provider) out.provider = provider;
  if (model) out.model = model;
  if (voice) out.voice = voice;
  return out;
}

/** Reduce a markdown message body to speakable plain text (operator dm
 *  130: "each message readable"). Strips fences/inline code, link/image
 *  syntax (keeps link TEXT), heading/quote/list markers, emphasis marks,
 *  the console's own fs/work chips are prose already. Collapses
 *  whitespace. Best-effort: readability, not a full markdown parser. */
export function speakable_text(md: string): string {
  let t = String(md || "");
  // Fenced code blocks: drop entirely (reading code aloud is noise).
  t = t.replace(/```[\s\S]*?```/g, " ");
  // Images ![alt](url) -> alt; links [text](url) -> text.
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Inline code `x` -> x.
  t = t.replace(/`([^`]+)`/g, "$1");
  // Heading / blockquote / list markers at line start.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  t = t.replace(/^[ \t]*>[ \t]?/gm, "");
  t = t.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  t = t.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");
  // Table pipes at line edges (a markdown table row reads as noise
  // otherwise) — strip leading/trailing pipes; interior pipes become
  // pauses. Separator rows (---|---) collapse via the whitespace pass.
  t = t.replace(/^[ \t]*\|/gm, "").replace(/\|[ \t]*$/gm, "").replace(/\|/g, ", ");
  // Bold/strikethrough (keep the words).
  t = t.replace(/(\*\*|__|~~)(.*?)\1/g, "$2");
  // Single * emphasis (keep the words).
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  // Single _ emphasis ONLY at word boundaries (adversary P2-4: an
  // unbounded rule ate underscores inside snake_case identifiers, which
  // this hub's traffic is dense with — "voice_settings" must stay intact).
  t = t.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1$2");
  // Horizontal rules.
  t = t.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, " ");
  // Collapse whitespace.
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
