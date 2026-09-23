// @vitest-environment jsdom
//
// Pins for the per-request executor picker (gateway c2194 point 5 /
// operator's per-request-selection directive): options come from the
// probed registry, unavailable agents are disabled with the reason, and
// the chosen canonical id rides the confirm callback. Registry absent
// (older gateway) = no picker, gateway default applies.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteConfirmModal } from "./execute_modals";

afterEach(() => {
  cleanup();
});

const BASE = {
  open: true,
  target: { kind: "planned", filename: "0001-x.md", title: "0001-x.md" },
  execute_mode: "uat" as const,
  set_execute_mode: () => {},
  action_loading: false,
  action_error: "",
  exec_cfg: { ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex" } as any,
  exec_cfg_loading: false,
  exec_cfg_error: "",
  on_close: () => {},
};

const REGISTRY = [
  { id: "codex", display: "Codex CLI", available: true, default: true },
  { id: "claude", display: "Claude Code", available: true },
  { id: "cursor-agent", display: "Cursor Agent", available: false },
  { id: "abstractcode", display: "AbstractCode", available: true },
];

describe("ExecuteConfirmModal executor picker", () => {
  it("offers the probed roster with unavailable agents disabled, and sends the chosen canonical id", () => {
    const on_confirm = vi.fn();
    render(<ExecuteConfirmModal {...BASE} executors={REGISTRY} on_confirm={on_confirm} />);

    const select = screen.getByText("Execution agent").parentElement!.querySelector("select") as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options.map((o) => o.value)).toEqual(["", "codex", "claude", "cursor-agent", "abstractcode"]);
    expect(options[0].text).toContain("gateway default (Codex CLI)");
    // Probed-unavailable agents cannot be picked here; the gateway would
    // 400 verbatim pre-enqueue anyway — the UI mirrors its truth.
    expect(options.find((o) => o.value === "cursor-agent")?.disabled).toBe(true);

    fireEvent.change(select, { target: { value: "claude" } });
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(on_confirm).toHaveBeenCalledWith(expect.objectContaining({ executor: "claude" }));
  });

  it("hides the picker when the registry is not served (gateway default applies)", () => {
    const on_confirm = vi.fn();
    render(<ExecuteConfirmModal {...BASE} executors={null} on_confirm={on_confirm} />);
    expect(screen.queryByText("Execution agent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    // No picker = no executor override in the confirm payload.
    expect(on_confirm).toHaveBeenCalledWith(undefined);
  });
});
