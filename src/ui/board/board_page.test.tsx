// @vitest-environment jsdom
//
// Component tests for the Board page: column rendering from stubbed
// gateway state, the busy-set behavior, card actions (promote to Ready,
// DoR-gated execute), and metadata chip hydration.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardPage } from "./board_page";

function make_stub_gateway() {
  const planned = [
    { kind: "planned", filename: "0001-x-ready.md", item_id: 1, package: "continuum", title: "Ready item", task_type: "feature", parsed: true },
    { kind: "planned", filename: "0002-x-busy.md", item_id: 2, package: "continuum", title: "Busy item", task_type: "bug", parsed: true },
  ];
  const proposed = [{ kind: "proposed", filename: "0003-x-idea.md", item_id: 3, package: "core", title: "An idea", task_type: "task", parsed: true }];

  const gateway: any = {
    backlog_list: vi.fn(async (kind: string) => {
      if (kind === "planned") return { items: planned };
      if (kind === "proposed") return { items: proposed };
      return { items: [] };
    }),
    backlog_exec_requests: vi.fn(async (opts: any) => {
      const status = String(opts?.status || "");
      if (status.includes("queued")) {
        return { ok: true, requests: [{ request_id: "r_live", status: "running", created_at: "2026-07-12T10:00:00Z", backlog_filename: "0002-x-busy.md" }] };
      }
      return { ok: true, requests: [{ request_id: "r_done", status: "promoted", created_at: "2026-07-12T08:00:00Z", finished_at: "2026-07-12T09:00:00Z", backlog_filename: "0009-x-old.md" }] };
    }),
    backlog_exec_active_items: vi.fn(async () => ({
      ok: true,
      items: [{ request_id: "r_live", status: "running", kind: "planned", filename: "0002-x-busy.md", relpath: "docs/backlog/planned/0002-x-busy.md" }],
    })),
    backlog_content: vi.fn(async (_kind: string, filename: string) => ({
      kind: _kind,
      filename,
      content: `# t\n\n> Type: feature\n> Priority: P1\n> Labels: sprint-29\n\n## Summary\nReal summary.\n\n## Acceptance Criteria\n- [ ] works\n\n## Testing (ADR-0019)\n- Level A:\n  - \`npm test\`\n`,
    })),
    backlog_move: vi.fn(async () => ({ ok: true })),
    backlog_execute: vi.fn(async () => ({ ok: true, request_id: "r_new" })),
    backlog_exec_config: vi.fn(async () => ({ ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex_cli", codex_available: true })),
    backlog_exec_request: vi.fn(async (id: string) => ({ ok: true, request_id: id, payload: { status: "running" } })),
    backlog_exec_feedback: vi.fn(async () => ({ ok: true })),
    backlog_exec_promote: vi.fn(async () => ({ ok: true })),
    backlog_exec_deploy_uat: vi.fn(async () => ({ ok: true })),
    backlog_update: vi.fn(async () => ({ ok: true, sha256: "x" })),
  };
  return gateway;
}

function render_board(gw: any) {
  return render(
    <BoardPage gateway={gw} gateway_connected={true} data_nonce={0} on_mutated={() => {}} on_open_executions={() => {}} />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BoardPage", () => {
  it("renders columns with cards in ruled positions (busy file only in In Progress)", async () => {
    const gw = make_stub_gateway();
    render_board(gw);

    expect(await screen.findByText("Ready item")).toBeTruthy();
    expect(screen.getByText("An idea")).toBeTruthy();
    // The busy planned file renders as its execution card, once.
    expect((await screen.findAllByText("Busy item")).length).toBe(1);
    expect(screen.getByText("running")).toBeTruthy();
    // Done attempt from terminal history.
    expect(screen.getByText("0009-x-old.md")).toBeTruthy();
    // Busy-set source was the batch-aware endpoint.
    expect(gw.backlog_exec_active_items).toHaveBeenCalled();
  });

  it("hydrates metadata chips lazily (priority + labels)", async () => {
    const gw = make_stub_gateway();
    render_board(gw);
    await screen.findByText("Ready item");
    await waitFor(() => expect(screen.getAllByText("P1").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText("sprint-29").length).toBeGreaterThanOrEqual(1);
  });

  it("promotes a Triage card to Ready via backlog_move", async () => {
    const gw = make_stub_gateway();
    render_board(gw);
    await screen.findByText("An idea");

    fireEvent.click(screen.getByRole("button", { name: "→ Ready" }));
    await waitFor(() =>
      expect(gw.backlog_move).toHaveBeenCalledWith({ from_kind: "proposed", to_kind: "planned", filename: "0003-x-idea.md" })
    );
  });

  it("gates Execute behind the DoR checklist and executes on confirm", async () => {
    const gw = make_stub_gateway();
    render_board(gw);
    await screen.findByText("Ready item");
    // Wait for metadata so the readiness checklist has evidence.
    await waitFor(() => expect(screen.getAllByText("P1").length).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(await screen.findByText("Execute backlog item?")).toBeTruthy();
    expect(screen.getByText(/Definition of Ready/)).toBeTruthy();
    expect(screen.getByText(/found 1: "works"/)).toBeTruthy();

    const buttons = screen.getAllByRole("button", { name: /^Execute$/ });
    fireEvent.click(buttons[buttons.length - 1]);
    // Server DoR gate contract (c1140): always dor=check; override only
    // after the operator has seen a failing checklist (not the case here).
    await waitFor(() =>
      expect(gw.backlog_execute).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "planned", filename: "0001-x-ready.md", execution_mode: "uat", dor: "check", override: false })
      )
    );
  });

  it("renders the server DoR refusal and sends override=true on the second confirm", async () => {
    const gw = make_stub_gateway();
    // First call: structured 409 refusal (the server gate is authoritative
    // even when the client checklist looked green). Second call: accepted.
    gw.backlog_execute = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("backlog_execute failed: dor"), {
          status: 409,
          // REAL wire shape: FastAPI wraps HTTPException detail (P0 fix pin).
          body: {
            detail: {
              error: "definition_of_ready_failed",
              checks: [{ id: "tests", label: "At least one concrete test command", ok: false, evidence: "none found under ## Testing" }],
            },
          },
        })
      )
      .mockResolvedValue({ ok: true, request_id: "r_new" });
    render_board(gw);
    await screen.findByText("Ready item");
    await waitFor(() => expect(screen.getAllByText("P1").length).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await screen.findByText("Execute backlog item?");
    fireEvent.click(screen.getAllByRole("button", { name: /^Execute$/ }).pop()!);

    // The modal now shows the SERVER's checks and names the refusal.
    expect(await screen.findByText(/the gateway refused this execute/)).toBeTruthy();
    expect(screen.getByText(/none found under ## Testing/)).toBeTruthy();

    // Second confirm is the explicit override.
    fireEvent.click(screen.getByRole("button", { name: "Execute anyway (override)" }));
    await waitFor(() => expect(gw.backlog_execute).toHaveBeenLastCalledWith(expect.objectContaining({ override: true })));
  });

  it("labels the gate explicitly when the spec cannot be scanned (readiness unknown)", async () => {
    const gw = make_stub_gateway();
    // Content fetch fails for everything: hydration misses AND the
    // fetch-on-demand in open_execute fails -> readiness null.
    gw.backlog_content = vi.fn(async () => {
      throw new Error("boom");
    });
    render_board(gw);
    await screen.findByText("Ready item");

    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(await screen.findByText(/NOT EVALUATED/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Execute (readiness unknown)" })).toBeTruthy();
  });

  it("labels a failing gate as an override with an Open spec affordance", async () => {
    const gw = make_stub_gateway();
    gw.backlog_content = vi.fn(async (_k: string, filename: string) => ({
      kind: _k,
      filename,
      content: "# t\n\n> Type: feature\n\n## Summary\n\n## Acceptance Criteria\n\n## Testing (ADR-0019)\n",
    }));
    render_board(gw);
    await screen.findByText("Ready item");

    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(await screen.findByText(/This spec is not ready/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Execute anyway (override)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open spec to fix" })).toBeTruthy();
  });

  it("opens the drawer with Spec/Runs/Review tabs on card click", async () => {
    const gw = make_stub_gateway();
    render_board(gw);
    fireEvent.click(await screen.findByText("Ready item"));

    expect(await screen.findByRole("button", { name: "Spec" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Runs/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Review/ })).toBeTruthy();
    await waitFor(() => expect(gw.backlog_content).toHaveBeenCalledWith("planned", "0001-x-ready.md"));
    expect(await screen.findByText("Real summary.")).toBeTruthy();
  });
});
