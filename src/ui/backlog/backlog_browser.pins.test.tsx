// @vitest-environment jsdom
//
// Behavior pins for the Backlog page (file-archive redesign 2026-07-13):
// kind-segmented data table, row lifecycle actions, drawer on row click,
// DoR-gated execute, batch selection, and the not-configured callout.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BacklogBrowserPage } from "../backlog_browser";

const SPEC = `# 0001-continuum: [BUG] Fix the doors

> Created: 2026-07-12 10:00:00 +0200
> Type: bug
> Priority: P1
> Labels: ui

## Summary
The doors are broken.

## Acceptance Criteria
- [ ] Doors open on click

## Testing (ADR-0019)
- Level A:
  - \`npm test\`
`;

function make_stub_gateway() {
  const planned = [
    {
      kind: "planned",
      filename: "0001-continuum-fix-doors.md",
      item_id: 1,
      package: "continuum",
      title: "Fix the doors",
      task_type: "bug",
      parsed: true,
      priority: "P1",
      labels: ["ui"],
    },
    {
      kind: "planned",
      filename: "0002-continuum-second.md",
      item_id: 2,
      package: "continuum",
      title: "Second item",
      task_type: "feature",
      parsed: true,
      priority: "",
      labels: [],
    },
  ];
  const gateway: any = {
    backlog_list: vi.fn(async (kind: string) => ({ ok: true, kind, items: kind === "planned" ? planned : [] })),
    backlog_content: vi.fn(async (kind: string, filename: string) => ({ ok: true, kind, filename, content: SPEC, sha256: "x" })),
    backlog_move: vi.fn(async () => ({ ok: true })),
    backlog_execute: vi.fn(async () => ({ ok: true, request_id: "r_new" })),
    backlog_execute_batch: vi.fn(async () => ({ ok: true, request_id: "r_batch" })),
    backlog_exec_config: vi.fn(async () => ({
      ok: true,
      runner_enabled: true,
      runner_alive: true,
      can_execute: true,
      executor: "codex_cli",
      codex_model: "gpt-5.2",
      codex_available: true,
    })),
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    backlog_exec_request: vi.fn(async () => ({ ok: true, payload: {} })),
    backlog_update: vi.fn(async () => ({ ok: true, sha256: "y" })),
  };
  return gateway;
}

function render_page(gw: any) {
  return render(<BacklogBrowserPage gateway={gw} gateway_connected={true} />);
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BacklogBrowserPage pins (archive redesign)", () => {
  it("loads the planned list on mount and renders table rows with metadata chips", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    expect(await screen.findByText("Fix the doors")).toBeTruthy();
    expect(screen.getByText("Second item")).toBeTruthy();
    // List-level metadata renders without content fetches.
    expect(screen.getByText("P1")).toBeTruthy();
    expect(screen.getByText("ui")).toBeTruthy();
    expect(gw.backlog_list).toHaveBeenCalledWith("planned");
  });

  it("filters via search", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    await screen.findByText("Fix the doors");
    fireEvent.change(screen.getByPlaceholderText(/Search backlog/), { target: { value: "second" } });
    await waitFor(() => expect(screen.queryByText("Fix the doors")).toBeNull());
    expect(screen.getByText("Second item")).toBeTruthy();
  });

  it("switches kinds through the segmented control", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    await screen.findByText("Fix the doors");
    fireEvent.click(screen.getByRole("button", { name: "Proposed" }));
    await waitFor(() => expect(gw.backlog_list).toHaveBeenCalledWith("proposed"));
  });

  it("opens the work-item drawer on row click", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    fireEvent.click(await screen.findByText("Fix the doors"));
    // Drawer fetches the spec content for the clicked file.
    await waitFor(() => expect(gw.backlog_content).toHaveBeenCalledWith("planned", "0001-continuum-fix-doors.md"));
  });

  it("runs the DoR-gated execute flow from the row action", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    await screen.findByText("Fix the doors");

    fireEvent.click(screen.getAllByRole("button", { name: "Execute" })[0]);
    expect(await screen.findByText("Execute backlog item?")).toBeTruthy();
    // Readiness evaluated from fetched content (all checks pass in SPEC).
    expect(screen.getByText(/Definition of Ready/)).toBeTruthy();

    const buttons = screen.getAllByRole("button", { name: /^Execute$/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(gw.backlog_execute).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "planned", filename: "0001-continuum-fix-doors.md", dor: "check", override: false })
      )
    );
  });

  it("moves items through row lifecycle actions", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    await screen.findByText("Fix the doors");
    fireEvent.click(screen.getAllByRole("button", { name: "→ Triage" })[0]);
    await waitFor(() =>
      expect(gw.backlog_move).toHaveBeenCalledWith({ from_kind: "planned", to_kind: "proposed", filename: "0001-continuum-fix-doors.md" })
    );
  });

  it("selects rows for batch execute (two required)", async () => {
    const gw = make_stub_gateway();
    render_page(gw);
    await screen.findByText("Fix the doors");
    fireEvent.click(screen.getByLabelText("Select 0001-continuum-fix-doors.md"));
    fireEvent.click(screen.getByLabelText("Select 0002-continuum-second.md"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Execute batch" }));
    expect(await screen.findByText("Execute batch (single context)?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Execute batch" }).pop()!);
    await waitFor(() =>
      expect(gw.backlog_execute_batch).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { kind: "planned", filename: "0001-continuum-fix-doors.md" },
            { kind: "planned", filename: "0002-continuum-second.md" },
          ],
          dor: "check",
        })
      )
    );
  });

  it("renders the folder-not-available panel (never an env-var recipe) when the gateway's backlog folder is unusable", async () => {
    // Gateway mission II: a fresh gateway has its own folder, so this state
    // is a vanished saved folder (or a gateway older than the setting).
    const gw = make_stub_gateway();
    gw.backlog_list = vi.fn(async () => {
      throw new Error("backlog_list failed: Backlog folder not available on this gateway: the folder does not exist (set by the saved setting).");
    });
    gw.backlog_status = vi.fn(async () => ({
      available: false,
      source: "stored",
      path: "/gone",
      reason: "the folder does not exist (set by the saved setting)",
      writable: true,
      default_path: "/data/backlog",
    }));
    gw.admin_runtime_config_update = vi.fn(async () => ({}));
    render_page(gw);
    expect(await screen.findByText("This gateway's backlog folder is not available")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Use the gateway's own folder" })).toBeTruthy();
    expect(document.body.textContent || "").not.toMatch(/ABSTRACTGATEWAY_|setup required/);
  });
});
