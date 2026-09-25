// Client for Continuum's own server settings (GET/PUT
// /api/continuum/settings, bin/settings.js). Local only: the server
// refuses other machines and cross-origin callers. Values arrive with the
// rung that won — launch flag > setting > environment (legacy) > default.

export type SettingSource = "flag" | "setting" | "env" | "default";

export type ServerSetting = { value?: unknown; set?: boolean; source: SettingSource };

export type ServerSettingsView = {
  settings: Record<string, ServerSetting>;
  writable: string[];
  settings_file: string;
};

export const SERVER_SETTINGS_PATH = "/api/continuum/settings";

async function call(init?: RequestInit): Promise<ServerSettingsView> {
  const r = await fetch(SERVER_SETTINGS_PATH, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON body (an older server answers the SPA page for this path)
  }
  if (!r.ok || !body || typeof body !== "object" || !body.settings) {
    const detail = body && typeof body === "object" ? body.detail || body.error : "";
    const err = new Error(detail || `settings unavailable (HTTP ${r.status})`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return body as ServerSettingsView;
}

export function get_server_settings(): Promise<ServerSettingsView> {
  return call();
}

/** `value: null` removes the saved value (back to the default). */
export function save_server_setting(key: string, value: string | null): Promise<ServerSettingsView> {
  return call({ method: "PUT", body: JSON.stringify({ [key]: value }) });
}
