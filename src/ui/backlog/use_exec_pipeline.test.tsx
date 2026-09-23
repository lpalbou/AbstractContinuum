// @vitest-environment jsdom
//
// Contract tests for the byte-cursor log follow in use_exec_pipeline
// (gateway after_bytes contract, 2026-07-12): first load takes the trailing
// window, subsequent polls send after_bytes and append deltas, reset=true
// restarts the window, and pre-cursor gateways fall back to whole-tail
// replacement.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { use_exec_pipeline } from "./use_exec_pipeline";

function make_gateway(log_impl: (args: any) => any) {
  return {
    backlog_exec_config: vi.fn(async () => ({ ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex_cli" })),
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    backlog_exec_request: vi.fn(async (request_id: string) => ({ ok: true, request_id, payload: { status: "running", result: {} } })),
    backlog_exec_log_tail: vi.fn(async (args: any) => log_impl(args)),
  } as any;
}

function render_pipeline(gateway: any) {
  return renderHook(() =>
    use_exec_pipeline({
      gateway,
      can_use_gateway: true,
      kind: "processing",
      completed_view: "tasks",
      is_exec_view: false, // polling effects off; we drive loads manually
      is_compact_layout: false,
      set_compact_pane: () => {},
      on_status_transfer: () => {},
    })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("use_exec_pipeline log cursor follow", () => {
  it("first load takes the window, later polls append deltas via after_bytes", async () => {
    const calls: any[] = [];
    const gw = make_gateway((args) => {
      calls.push(args);
      if (args.after_bytes === undefined) {
        return { ok: true, request_id: args.request_id, name: args.name, bytes: 6, truncated: false, content: "line1\n", next_offset: 6 };
      }
      if (args.after_bytes === 6) {
        return { ok: true, request_id: args.request_id, name: args.name, bytes: 6, truncated: false, content: "line2\n", next_offset: 12 };
      }
      return { ok: true, request_id: args.request_id, name: args.name, bytes: 0, truncated: false, content: "", next_offset: 12 };
    });
    const { result } = render_pipeline(gw);

    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await waitFor(() => expect(result.current.exec_log_text).toBe("line1\n"));

    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await waitFor(() => expect(result.current.exec_log_text).toBe("line1\nline2\n"));

    // Idle poll: empty delta, unchanged cursor, text stable.
    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    expect(result.current.exec_log_text).toBe("line1\nline2\n");

    expect(calls[0].after_bytes).toBeUndefined();
    expect(calls[1].after_bytes).toBe(6);
    expect(calls[2].after_bytes).toBe(12);
  });

  it("reset=true replaces the buffer with the fresh window", async () => {
    let phase = 0;
    const gw = make_gateway((args) => {
      phase += 1;
      if (phase === 1) return { ok: true, request_id: args.request_id, name: args.name, bytes: 4, truncated: false, content: "old\n", next_offset: 4 };
      return { ok: true, request_id: args.request_id, name: args.name, bytes: 4, truncated: false, content: "new\n", next_offset: 4, reset: true };
    });
    const { result } = render_pipeline(gw);

    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await waitFor(() => expect(result.current.exec_log_text).toBe("new\n"));
  });

  it("falls back to whole-tail replacement on pre-cursor gateways", async () => {
    let phase = 0;
    const gw = make_gateway((args) => {
      phase += 1;
      // No next_offset field at all (older gateway).
      return { ok: true, request_id: args.request_id, name: args.name, bytes: 10, truncated: true, content: `tail-${phase}\n` };
    });
    const { result } = render_pipeline(gw);

    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await waitFor(() => expect(result.current.exec_log_text).toBe("tail-2\n"));
    // Never sent a cursor to a gateway that cannot honor it.
    for (const call of (gw.backlog_exec_log_tail as any).mock.calls) {
      expect(call[0].after_bytes).toBeUndefined();
    }
    expect(result.current.exec_log_truncated).toBe(true);
  });

  it("overlapping loads never double-append a delta (ref-based in-flight guard)", async () => {
    // Adversarial find 2026-07-12: the polling interval captures the load
    // function once, so a STATE-based guard is a dead closure — two
    // overlapping calls would both read the same cursor and append the
    // same delta twice. The guard must be a ref.
    let resolve_first: (v: any) => void = () => {};
    let call_n = 0;
    const gw = make_gateway(() => {
      call_n += 1;
      if (call_n === 1) {
        return new Promise((res) => {
          resolve_first = res;
        });
      }
      return { ok: true, request_id: "r1", name: "events", bytes: 6, truncated: false, content: "again\n", next_offset: 12 };
    });
    const { result } = render_pipeline(gw);

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
      // Fired while the first is still in flight (same tick): must no-op.
      second = result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
      resolve_first({ ok: true, request_id: "r1", name: "events", bytes: 6, truncated: false, content: "line1\n", next_offset: 6 });
      await Promise.all([first, second]);
    });

    expect(call_n).toBe(1);
    expect(result.current.exec_log_text).toBe("line1\n");
  });

  it("a failed list poll keeps the previous requests visible", async () => {
    let fail = false;
    const gw = make_gateway(() => ({ ok: true, content: "", next_offset: 0 }));
    gw.backlog_exec_requests = vi.fn(async () => {
      if (fail) throw new Error("gateway hiccup");
      return { ok: true, requests: [{ request_id: "r1", status: "running" }] };
    });
    const { result } = render_pipeline(gw);

    await act(async () => {
      await result.current.refresh_exec_list("processing");
    });
    expect(result.current.exec_requests).toHaveLength(1);

    fail = true;
    await act(async () => {
      await result.current.refresh_exec_list("processing");
    });
    expect(result.current.exec_requests).toHaveLength(1);
    expect(result.current.exec_error).toContain("gateway hiccup");
  });

  it("a different request or log name never reuses the previous cursor", async () => {
    const calls: any[] = [];
    const gw = make_gateway((args) => {
      calls.push(args);
      return { ok: true, request_id: args.request_id, name: args.name, bytes: 2, truncated: false, content: "x\n", next_offset: 2 };
    });
    const { result } = render_pipeline(gw);

    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "events" });
    });
    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r1", name: "stderr" });
    });
    await act(async () => {
      await result.current.load_exec_log_tail({ request_id: "r2", name: "stderr" });
    });
    expect(calls[1].after_bytes).toBeUndefined();
    expect(calls[2].after_bytes).toBeUndefined();
  });
});
