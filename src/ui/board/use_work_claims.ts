// Pointer-claim rows for the board's seat-work join (S3; Option A vote
// c3010; widened for operator dm 94 — "the board must reflect team
// work"). ONE store-keys listing per poll answers "which rows changed"
// (key+version); values fetch only on version change — the version is
// the cache key, so a calm hub costs one request per cycle.
//
// JOIN RULE (dm 94 widening): a row joins by its VALUE's `item` work id
// first (free-text keys like claim:agent-0011-… carry the pointer in the
// value — the room's dominant spelling), falling back to an id-shaped
// KEY. Done-marked rows feed the Done lane (recent completed team work)
// instead of vanishing.
//
// Failure posture: this is an ANNOTATION lane. Any refusal (a console
// server predating the store routes, a hub outage) disables the lane for
// a long backoff and the board renders exactly as before — chips absent,
// never an error wall.
import { useEffect, useRef, useState } from "react";

import { HubClient } from "../../lib/hub_client";
import { type WorkClaim, parse_work_id } from "../../lib/work_id";

/** Claims live in the coordination room. One room today; widen to a list
 *  when work coordination spreads (the fetch shape already folds rooms). */
const CLAIM_CHANNELS = ["commons"];
const POLL_MS = 30_000;
const DISABLED_RETRY_MS = 5 * 60_000;

export type DoneClaim = { item: string; owner: string; receipt?: string; updated_at?: number };

/** Hub-resident work row (`work:<id>` — the unified backlog index,
 *  operator dm 105 ruling; shape agreed skill c3339 + continuum c3343):
 *  status carries the FILE's four lifecycle words ONLY — in_progress is
 *  DERIVED from claims, never stored. */
export type HubWorkRow = {
  item: string;
  title?: string;
  status: "proposed" | "planned" | "completed" | "deprecated";
  owner?: string;
  receipt?: string;
  card?: string;
  updated_at?: number;
};

export type WorkClaimsView = { live: Map<string, WorkClaim>; done: DoneClaim[]; work: Map<string, HubWorkRow> };

const EMPTY: WorkClaimsView = { live: new Map(), done: [], work: new Map() };

const WORK_STATUSES = new Set(["proposed", "planned", "completed", "deprecated"]);

/** The work id a claim row points at: value.item (validated) first, else
 *  an id-shaped key. Exported for the model tests. */
export function claim_row_item(key: string, value: any): string | null {
  const from_value = value && typeof value === "object" ? String(value.item || "") : "";
  if (from_value && parse_work_id(from_value)) return from_value;
  const from_key = key.startsWith("claim:") ? key.slice("claim:".length) : "";
  return from_key && parse_work_id(from_key) ? from_key : null;
}

export function use_work_claims(enabled: boolean): WorkClaimsView {
  const [view, set_view] = useState<WorkClaimsView>(EMPTY);
  const hub_ref = useRef(new HubClient());
  const cache_ref = useRef<Map<string, { version: number; value: any }>>(new Map());
  const disabled_until = useRef(0);
  const inflight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const tick = async () => {
      if (inflight.current || Date.now() < disabled_until.current) return;
      inflight.current = true;
      try {
        const live = new Map<string, WorkClaim>();
        const done: DoneClaim[] = [];
        const work = new Map<string, HubWorkRow>();
        for (const channel of CLAIM_CHANNELS) {
          // LIST-FIRST (agora c3345, 0.12.19): one call serves every
          // work:* row parsed. Older hubs 404 -> the store loop below
          // reads them row by row (feature detection, not an error).
          let work_listed = false;
          try {
            const listed = await hub_ref.current.work_rows(channel);
            for (const r of listed) {
              const id = String((r as any).id || (r as any).item || "");
              const status = String((r as any).status || "").toLowerCase();
              if (!parse_work_id(id) || !WORK_STATUSES.has(status)) continue;
              work.set(id, {
                item: id,
                title: typeof (r as any).title === "string" ? (r as any).title : undefined,
                status: status as HubWorkRow["status"],
                owner: typeof (r as any).owner === "string" ? (r as any).owner : undefined,
                receipt: typeof (r as any).receipt === "string" ? (r as any).receipt : undefined,
                card: typeof (r as any).card === "string" ? (r as any).card : undefined,
                updated_at: (r as any).updated_at,
              });
            }
            work_listed = true;
          } catch {
            // pre-0.12.19 hub or proxy: fall through to the store scan
          }
          const rows = await hub_ref.current.store_keys(channel);
          for (const row of rows) {
            const key = String(row.key || "");
            // Unified backlog rows (work:<id>) ride the same listing.
            if (key.startsWith("work:")) {
              if (work_listed) continue; // list endpoint already served them
              const id = key.slice("work:".length);
              if (!parse_work_id(id)) continue; // ruled id form only
              const version = Number(row.version || 0);
              const cache_key = `${channel}\u0000${key}`;
              const cached = cache_ref.current.get(cache_key);
              let value: any;
              if (cached && cached.version === version) {
                value = cached.value;
              } else {
                const res = await hub_ref.current.store_get(channel, key);
                value = res?.value;
                cache_ref.current.set(cache_key, { version, value });
              }
              const status = value && typeof value === "object" ? String(value.status || "").toLowerCase() : "";
              if (!WORK_STATUSES.has(status)) continue; // stored rendered words refused (S0)
              work.set(id, {
                item: id,
                title: typeof value.title === "string" ? value.title : undefined,
                status: status as HubWorkRow["status"],
                owner: typeof value.owner === "string" ? value.owner : undefined,
                receipt: typeof value.receipt === "string" ? value.receipt : undefined,
                card: typeof value.card === "string" ? value.card : undefined,
                updated_at: row.updated_at,
              });
              continue;
            }
            if (!key.startsWith("claim:")) continue;
            const version = Number(row.version || 0);
            const cache_key = `${channel}\u0000${key}`;
            const cached = cache_ref.current.get(cache_key);
            let value: any;
            if (cached && cached.version === version) {
              value = cached.value;
            } else {
              const res = await hub_ref.current.store_get(channel, key);
              value = res?.value;
              cache_ref.current.set(cache_key, { version, value });
            }
            if (!value || typeof value !== "object" || typeof value.owner !== "string" || !value.owner) continue;
            // dm 103 widening: rows WITHOUT a resolvable work id still
            // render — the free-text claim name is the label (the room's
            // dominant legacy spelling; invisible bookkeeping made Done
            // "ridiculously small" and hid stale ongoing rows).
            const item = claim_row_item(key, value) || key.slice("claim:".length);
            if (!item) continue;
            const is_done = Boolean(value.done) || String(value.status || "").toLowerCase() === "done";
            if (is_done) {
              done.push({ item, owner: value.owner, receipt: typeof value.receipt === "string" ? value.receipt : undefined, updated_at: row.updated_at });
            } else if (!live.has(item)) {
              live.set(item, value as WorkClaim);
            }
          }
        }
        done.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        if (alive) {
          set_view((cur) => {
            const same =
              cur.live.size === live.size &&
              [...live.keys()].every((k) => JSON.stringify(cur.live.get(k)) === JSON.stringify(live.get(k))) &&
              JSON.stringify(cur.done) === JSON.stringify(done) &&
              cur.work.size === work.size &&
              [...work.keys()].every((k) => JSON.stringify(cur.work.get(k)) === JSON.stringify(work.get(k)));
            return same ? cur : { live, done, work };
          });
        }
      } catch {
        // Feature-absent (old proxy) or hub down: long backoff, chips off.
        disabled_until.current = Date.now() + DISABLED_RETRY_MS;
        if (alive) set_view((cur) => (cur.live.size || cur.done.length || cur.work.size ? EMPTY : cur));
      } finally {
        inflight.current = false;
      }
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  return view;
}
