// @vitest-environment jsdom
//
// Pins for the board data hook's degradation contract (adversary-ranked
// #2): one failing endpoint must degrade the board with a label, never
// blank it; the busy set falls back to live request filenames when the
// batch-aware endpoint is unavailable.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { use_board_data } from "./use_board_data";

function gateway_with(overrides: Partial<Record<string, any>>) {
  return {
    backlog_list: vi.fn(async (kind: string) => {
      if (kind === "planned") return { items: [{ kind, filename: "a.md", item_id: 1, package: "x", title: "A", task_type: "task", parsed: true }] };
      return { items: [] };
    }),
    backlog_exec_requests: vi.fn(async (opts: any) => {
      const status = String(opts?.status || "");
      if (status.includes("queued")) {
        return { ok: true, requests: [{ request_id: "r1", status: "running", created_at: "t", backlog_filename: "a.md" }] };
      }
      return { ok: true, requests: [] };
    }),
    backlog_exec_active_items: vi.fn(async () => ({ ok: true, items: [{ request_id: "r1", status: "running", kind: "planned", filename: "a.md", relpath: "p" }] })),
    backlog_content: vi.fn(async () => ({ content: "# t" })),
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("use_board_data degradation", () => {
  it("renders and labels a partial board when the busy-set endpoint fails", async () => {
    const gw = gateway_with({
      backlog_exec_active_items: vi.fn(async () => {
        throw new Error("410 gone");
      }),
    });
    const { result } = renderHook(() => use_board_data({ gateway: gw, can_use_gateway: true, data_nonce: 0 }));

    await waitFor(() => expect(result.current.cards.length).toBeGreaterThan(0));
    expect(result.current.degraded).toContain("#FALLBACK");
    expect(result.current.degraded).toContain("busy set");
    expect(result.current.error).toBe("");
    // Fallback busy set from the live request's own filename: the running
    // file still renders exactly once (as its execution card).
    const a_cards = result.current.cards.filter((c) => c.filename === "a.md");
    expect(a_cards).toHaveLength(1);
    expect(a_cards[0].column).toBe("in_progress");
  });

  it("keeps the previous board and errors only when every source fails", async () => {
    const boom = vi.fn(async () => {
      throw new Error("down");
    });
    const gw = gateway_with({ backlog_list: boom, backlog_exec_requests: boom, backlog_exec_active_items: boom });
    const { result } = renderHook(() => use_board_data({ gateway: gw, can_use_gateway: true, data_nonce: 0 }));

    await waitFor(() => expect(result.current.error).toContain("all sources failed"));
    expect(result.current.cards).toEqual([]);
  });

  it("renders cleanly (no degradation label) when all sources succeed", async () => {
    const gw = gateway_with({});
    const { result } = renderHook(() => use_board_data({ gateway: gw, can_use_gateway: true, data_nonce: 0 }));
    await waitFor(() => expect(result.current.cards.length).toBeGreaterThan(0));
    expect(result.current.degraded).toBe("");
  });
});
