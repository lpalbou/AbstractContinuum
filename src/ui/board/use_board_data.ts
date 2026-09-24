// Data layer for the Board: fetches the two file lists + exec requests,
// derives cards, and maintains a bounded lazy metadata cache (priority /
// labels / readiness chips) for file-backed cards.
//
// Metadata source note: gateways ≥ c1090 (2026-07-12) serve priority/labels
// IN the list summaries — chips are exact from the list call and no content
// fetch happens for them. Older gateways fall back to the bounded lazy
// content scan (#FALLBACK: visible cards only, small concurrency, session
// cache — a labeled best-effort, not an N+1 storm).
import { useCallback, useEffect, useRef, useState } from "react";

import type { BacklogItemSummary, GatewayClient } from "../../lib/gateway_client";
import { is_backlog_unavailable } from "../backlog_folder";
import { type BoardCard, type WorkItemMetadata, card_has_chip_meta, derive_board_cards, parse_work_item_metadata } from "./board_model";

const METADATA_FETCH_LIMIT = 40; // per refresh, across columns
const METADATA_CONCURRENCY = 4;

export type BoardData = ReturnType<typeof use_board_data>;

export function use_board_data(opts: { gateway: GatewayClient; can_use_gateway: boolean; data_nonce: number }) {
  const { gateway, can_use_gateway, data_nonce } = opts;

  const [cards, set_cards] = useState<BoardCard[]>([]);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState("");
  /** Non-empty when the board renders on partial data (#FALLBACK label). */
  const [degraded, set_degraded] = useState("");
  /** The gateway's "backlog folder not available" 404 (null = available). */
  const [unavailable, set_unavailable] = useState<unknown>(null);
  /** Backlog items (proposed + planned files) in the last good load; null
   *  until the first load answers (drives the empty state). */
  const [item_count, set_item_count] = useState<number | null>(null);
  const [metadata, set_metadata] = useState<Record<string, WorkItemMetadata>>({});
  const metadata_ref = useRef<Record<string, WorkItemMetadata>>({});
  const inflight_ref = useRef(false);

  const refresh = useCallback(
    async (opts?: { background?: boolean }): Promise<void> => {
      if (!can_use_gateway) return;
      if (inflight_ref.current) return;
      inflight_ref.current = true;
      // Background polls must not flip the toolbar into "Refreshing…"
      // every 10s (adversarial find: loading churn).
      if (!opts?.background) set_loading(true);
      try {
        // Status-SCOPED request fetches: the gateway filters before the
        // limit, so live QA debt can never fall out of a window churned by
        // terminal history. The active_items call is the batch-aware busy
        // set — the same source the Backlog page uses. allSettled: one
        // failing endpoint degrades the board (labeled), never blanks it.
        const [proposed_res, planned_res, active_res, terminal_res, active_items_res] = await Promise.allSettled([
          gateway.backlog_list("proposed"),
          gateway.backlog_list("planned"),
          gateway.backlog_exec_requests({ status: "queued,running,awaiting_qa", limit: 200 }),
          gateway.backlog_exec_requests({ status: "promoted,completed,failed", limit: 60 }),
          gateway.backlog_exec_active_items({ status: "queued,running,awaiting_qa", limit: 1200 }),
        ]);
        const failures: string[] = [];
        const failure_reasons: unknown[] = [];
        const take = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
          if (r.status === "fulfilled") return r.value;
          failures.push(label);
          failure_reasons.push(r.reason);
          return null;
        };
        const proposed_v = take(proposed_res, "proposed list");
        const planned_v = take(planned_res, "planned list");
        const active_v = take(active_res, "live requests");
        const terminal_v = take(terminal_res, "recent history");
        const active_items_v = take(active_items_res, "busy set");

        // The one gateway posture that blanks the whole lane gets its own
        // state: the backlog folder is not available (a generic "all
        // sources failed" reads as app breakage when the fix is one setting).
        set_unavailable(failure_reasons.find((r) => is_backlog_unavailable(r)) ?? null);

        if (!proposed_v && !planned_v && !active_v && !terminal_v) {
          // Nothing usable — keep the previous board and surface the error.
          set_error("Failed to load the board (all sources failed)");
          return;
        }
        set_error("");

        const active_requests = Array.isArray((active_v as any)?.requests) ? (active_v as any).requests : [];
        let active_items = Array.isArray((active_items_v as any)?.items) ? ((active_items_v as any).items as any[]) : [];
        if (!active_items_v) {
          // #FALLBACK: busy set degrades to single-file live request
          // filenames (batch members unknown — their Ready cards may show
          // a 409 on execute until the endpoint recovers).
          active_items = active_requests
            .map((r: any) => ({
              request_id: String(r.request_id || ""),
              status: String(r.status || ""),
              kind: "planned",
              filename: String(r.backlog_filename || "").trim(),
              relpath: String(r.backlog_relpath || "").trim(),
            }))
            .filter((it: any) => it.filename && !/^batch\(\d+\)$/i.test(it.filename));
        }

        const proposed = Array.isArray((proposed_v as any)?.items) ? (proposed_v as any).items : [];
        const planned = Array.isArray((planned_v as any)?.items) ? (planned_v as any).items : [];
        set_item_count(proposed_v && planned_v ? proposed.length + planned.length : null);
        const next = derive_board_cards({
          proposed,
          planned,
          active_requests,
          terminal_requests: Array.isArray((terminal_v as any)?.requests) ? (terminal_v as any).requests : [],
          active_items,
        });
        set_cards(next);
        set_degraded(failures.length ? `#FALLBACK partial board — failed: ${failures.join(", ")}` : "");
        void hydrate_metadata(next, proposed, planned);
      } finally {
        inflight_ref.current = false;
        if (!opts?.background) set_loading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateway, can_use_gateway]
  );

  async function hydrate_metadata(next_cards: BoardCard[], proposed: BacklogItemSummary[], planned: BacklogItemSummary[]): Promise<void> {
    const kind_by_filename = new Map<string, "proposed" | "planned">();
    for (const it of proposed) kind_by_filename.set(String(it.filename || "").trim(), "proposed");
    for (const it of planned) kind_by_filename.set(String(it.filename || "").trim(), "planned");

    const wanted = next_cards
      // Cards whose chips the LIST already answered (c1090 metadata) skip
      // the content scan — EXCEPT the Ready lane, whose DoR dot needs
      // content-only signals (acceptance/tests/summary) and is small by
      // nature. Older gateways keep the full bounded scan (#FALLBACK).
      .filter((c) => c.filename && !metadata_ref.current[c.filename] && kind_by_filename.has(c.filename))
      .filter((c) => !card_has_chip_meta(c) || c.column === "ready")
      .slice(0, METADATA_FETCH_LIMIT)
      .map((c) => ({ filename: c.filename as string, kind: kind_by_filename.get(c.filename as string) as "proposed" | "planned" }));
    if (!wanted.length) return;

    const queue = [...wanted];
    const workers = Array.from({ length: Math.min(METADATA_CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        try {
          const res = await gateway.backlog_content(job.kind, job.filename);
          const meta = parse_work_item_metadata(String(res?.content || ""));
          metadata_ref.current = { ...metadata_ref.current, [job.filename]: meta };
        } catch {
          // Chips stay absent for this card — labeled degradation, never an error wall.
        }
      }
    });
    await Promise.all(workers);
    set_metadata(metadata_ref.current);
  }

  /** Force-refresh one file's metadata (after a drawer edit). */
  const refresh_item_metadata = useCallback(
    async (kind: "proposed" | "planned" | "completed", filename: string): Promise<void> => {
      try {
        const res = await gateway.backlog_content(kind as any, filename);
        const meta = parse_work_item_metadata(String(res?.content || ""));
        metadata_ref.current = { ...metadata_ref.current, [filename]: meta };
        set_metadata(metadata_ref.current);
      } catch {
        // best-effort
      }
    },
    [gateway]
  );

  useEffect(() => {
    void refresh();
  }, [refresh, data_nonce]);

  // The board's live half (In Progress / In Review) follows the pipeline;
  // poll at a calm cadence — the Executions page is the high-frequency view.
  useEffect(() => {
    if (!can_use_gateway) return;
    // Stand down while the shared-IP gateway lock is warm (incident
    // 2026-07-15): a poller that keeps firing during a 429 lockout keeps
    // the window warm for every localhost app. The next tick after the
    // window clears resumes normally (a success resets the client's step).
    const t = setInterval(() => {
      if (gateway.is_backing_off()) return;
      void refresh({ background: true });
    }, 10_000);
    return () => clearInterval(t);
  }, [can_use_gateway, refresh, gateway]);

  const unconfigured = unavailable !== null;
  return { cards, loading, error, degraded, unconfigured, unavailable, item_count, metadata, refresh, refresh_item_metadata };
}
