/** Deterministic run ids for gateway voice/TTS session anchoring.
 *  Shared by Team page and backlog — not backlog-specific logic. */

const _SAFE_RUN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function is_safe_run_id(value: string): boolean {
  return _SAFE_RUN_ID_PATTERN.test(String(value || "").trim());
}

async function sha256_hex(text: string): Promise<string> {
  const payload = String(text || "");
  const enc = new TextEncoder().encode(payload);
  const c: any = (globalThis as any).crypto;
  if (!c || !c.subtle || typeof c.subtle.digest !== "function") return "";
  const digest = await c.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Deterministic per-session run id used to scope voice artifacts (TTS/STT). */
export async function session_memory_run_id(session_id: string): Promise<string> {
  const sid = String(session_id || "").trim();
  if (!sid) throw new Error("session_id is required");
  if (is_safe_run_id(sid)) {
    const rid = `session_memory_${sid}`;
    if (is_safe_run_id(rid)) return rid;
  }
  const digest = await sha256_hex(sid);
  return `session_memory_sha_${digest.slice(0, 32)}`;
}
