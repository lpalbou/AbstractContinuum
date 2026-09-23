// @vitest-environment jsdom
//
// Behavior tests for the Executions landing page: live active-request list,
// status counters, recently-finished strip, and detail loading.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionsPage } from "./executions_page";

function make_stub_gateway() {
  const active = [
    {
      request_id: "req_run",
      status: "running",
      created_at: "2026-07-12T10:00:00Z",
      started_at: "2026-07-12T10:00:05Z",
      backlog_filename: "0004-continuum-live-item.md",
    },
    {
      request_id: "req_qa",
      status: "awaiting_qa",
      created_at: "2026-07-12T09:00:00Z",
      backlog_filename: "0005-continuum-qa-item.md",
    },
  ];
  const finished = [
    {
      request_id: "req_done",
      status: "promoted",
      created_at: "2026-07-12T08:00:00Z",
      started_at: "2026-07-12T08:00:05Z",
      finished_at: "2026-07-12T08:10:05Z",
      backlog_filename: "0001-continuum-done-item.md",
    },
  ];

  const gateway: any = {
    backlog_exec_config: vi.fn(async () => ({
      ok: true,
      runner_enabled: true,
      runner_alive: true,
      can_execute: true,
      executor: "codex_cli",
      codex_model: "gpt-5.2",
      codex_available: true,
    })),
    backlog_exec_requests: vi.fn(async (opts: any) => {
      const status = String(opts?.status || "");
      if (status.includes("queued")) return { ok: true, requests: active };
      return { ok: true, requests: finished };
    }),
    backlog_exec_request: vi.fn(async (request_id: string) => ({
      ok: true,
      request_id,
      payload: { status: "running", backlog: { filename: "0004-continuum-live-item.md" }, result: {} },
    })),
    backlog_exec_log_tail: vi.fn(async (args: any) => ({
      ok: true,
      request_id: args.request_id,
      name: args.name,
      bytes: 2,
      truncated: false,
      content: "",
    })),
  };
  return gateway;
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExecutionsPage", () => {
  it("shows active requests with live status counters (stat strip)", async () => {
    const gw = make_stub_gateway();
    render(<ExecutionsPage gateway={gw} gateway_connected={true} />);

    expect(await screen.findByText("0004-continuum-live-item.md")).toBeTruthy();
    expect(screen.getByText("0005-continuum-qa-item.md")).toBeTruthy();
    // Stat strip: label + value pairs ("running" also appears as a status
    // chip on the active card, so scope to the strip).
    const strip = document.querySelector(".stat_strip");
    expect(strip).toBeTruthy();
    const strip_text = String(strip?.textContent || "");
    expect(strip_text).toContain("running");
    expect(strip_text).toContain("awaiting QA");
    expect(strip_text).toContain("queued");
    expect(strip_text).toContain("1"); // running=1
    expect(strip_text).toContain("0"); // queued=0
  });

  it("shows the recently finished table", async () => {
    const gw = make_stub_gateway();
    render(<ExecutionsPage gateway={gw} gateway_connected={true} />);
    expect(await screen.findByText("0001-continuum-done-item.md")).toBeTruthy();
    expect(screen.getByText("10m 0s")).toBeTruthy();
  });

  it("loads detail + log tail when selecting an active request", async () => {
    const gw = make_stub_gateway();
    render(<ExecutionsPage gateway={gw} gateway_connected={true} />);

    fireEvent.click(await screen.findByText("0004-continuum-live-item.md"));
    await waitFor(() => expect(gw.backlog_exec_request).toHaveBeenCalledWith("req_run"));
    await waitFor(() => expect(gw.backlog_exec_log_tail).toHaveBeenCalled());
    expect(await screen.findByText("Execution")).toBeTruthy();
  });

  it("shows the executor worker badge from config (executor-agnostic label)", async () => {
    const gw = make_stub_gateway();
    render(<ExecutionsPage gateway={gw} gateway_connected={true} />);
    expect(await screen.findByText(/codex_cli worker on/)).toBeTruthy();
  });

  it("prompts to connect when the gateway is unreachable", async () => {
    const gw = make_stub_gateway();
    render(<ExecutionsPage gateway={gw} gateway_connected={false} />);
    expect(await screen.findByText(/Not connected/)).toBeTruthy();
    expect(gw.backlog_exec_requests).not.toHaveBeenCalled();
  });

  it("renders the no-executor callout even when the runner thread is alive (health = can_execute)", async () => {
    // The P0 state: runner threads up, executor "none" — the gateway can
    // run NOTHING, and a green page here once hid exactly that.
    const gw = make_stub_gateway();
    gw.backlog_exec_config = vi.fn(async () => ({
      ok: true,
      runner_enabled: true,
      runner_alive: true,
      can_execute: false,
      executor: "none",
      codex_model: null,
      codex_available: null,
    }));
    render(<ExecutionsPage gateway={gw} gateway_connected={true} />);

    expect(await screen.findByText("No execution agent on this gateway")).toBeTruthy();
    expect(screen.getByText(/ABSTRACTGATEWAY_BACKLOG_EXEC_RUNNER/)).toBeTruthy();
    // The remediation names the executor env, not just the runner flag.
    expect(screen.getByText(/ABSTRACTGATEWAY_BACKLOG_EXECUTOR/)).toBeTruthy();
    // The toolbar chip does not render an ok tone for this state.
    const chip = screen.getByText(/no execution agent/);
    expect(chip.className).not.toContain("ok");
  });

  it("speaks REGISTRY truth when executors exist but no default is picked (no env recipe, Settings jump)", async () => {
    // The operator's live contradiction (2026-07-14 21:13): the registry
    // showed four available executors while this page said "no executor
    // ... env + restart". With the registry served, the fix is one
    // Settings click — the copy and the action must say so.
    const gw = make_stub_gateway();
    gw.backlog_exec_config = vi.fn(async () => ({
      ok: true,
      runner_enabled: true,
      runner_alive: true,
      can_execute: false,
      executor: "none",
    }));
    gw.admin_executors = vi.fn(async () => [
      { id: "codex_cli", display: "Codex CLI", available: true, default: false },
      { id: "claude_code", display: "Claude Code", available: true },
    ]);
    const open_settings = vi.fn();
    render(<ExecutionsPage gateway={gw} gateway_connected={true} on_open_settings={open_settings} />);

    expect(await screen.findByText("No default executor selected")).toBeTruthy();
    expect(screen.getByText(/Codex CLI, Claude Code/)).toBeTruthy();
    // Registry live ⇒ the env+restart recipe would contradict it.
    expect(screen.queryByText(/ABSTRACTGATEWAY_BACKLOG_EXECUTOR/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(open_settings).toHaveBeenCalledTimes(1);
  });
});
