// Small shared hooks for the backlog modules.
import { useEffect, useState } from "react";

export function use_media_query(query: string): boolean {
  const get_matches = (): boolean => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, set_matches] = useState<boolean>(get_matches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const on_change = () => set_matches(mql.matches);
    on_change();
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", on_change);
    else (mql as any).addListener?.(on_change);
    return () => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", on_change);
      else (mql as any).removeListener?.(on_change);
    };
  }, [query]);

  return matches;
}

/**
 * Executor registry (GET /admin/executors, feature-detected): the
 * per-request agent picker's option source. null = the gateway does not
 * serve the registry (older build) — pickers hide and the gateway
 * default applies (gateway c2194: served ids are canonical).
 */
export function use_executor_registry(
  gateway: { admin_executors: () => Promise<any> },
  connected: boolean
): Array<{ id: string; display?: string; available?: boolean; default?: boolean }> | null {
  const [rows, set_rows] = useState<Array<{ id: string; display?: string; available?: boolean; default?: boolean }> | null>(null);
  useEffect(() => {
    if (!connected) {
      set_rows(null);
      return;
    }
    let stop = false;
    void (async () => {
      try {
        const res = await gateway.admin_executors();
        const list = Array.isArray(res) ? res : Array.isArray((res as any)?.executors) ? (res as any).executors : [];
        if (!stop) set_rows(list);
      } catch {
        if (!stop) set_rows(null);
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  return rows;
}
