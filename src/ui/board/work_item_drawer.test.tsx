// @vitest-environment jsdom
//
// Pins for the drawer's target derivation (adversary-ranked #1 untested
// behavior): kind resolution for Done attempts whose file was archived to
// completed/, and batch targets never adopting foreign requests.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkItemDrawer } from "./work_item_drawer";

function base_gateway() {
  return {
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    backlog_exec_request: vi.fn(async (id: string) => ({ ok: true, request_id: id, payload: { status: "awaiting_qa", execution_mode: "uat" } })),
    backlog_exec_feedback: vi.fn(async () => ({ ok: true })),
    backlog_exec_promote: vi.fn(async () => ({ ok: true })),
    backlog_exec_deploy_uat: vi.fn(async () => ({ ok: true })),
    backlog_update: vi.fn(async () => ({ ok: true, sha256: "x" })),
  } as any;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkItemDrawer target derivation", () => {
  it("resolves Done attempts to the completed/ file (kind=null fallback chain)", async () => {
    const gw = base_gateway();
    gw.backlog_content = vi.fn(async (kind: string, filename: string) => {
      if (kind === "completed") return { kind, filename, content: "# Archived spec\n\n## Summary\nDone." };
      const err: any = new Error(`backlog_content failed: 404`);
      throw err;
    });
    render(
      <WorkItemDrawer
        gateway={gw}
        can_use_gateway={true}
        target={{ filename: "0001-x.md", kind: null, request_id: "r_done", title: "Done thing" }}
        on_close={() => {}}
        on_mutated={async () => {}}
        on_open_executions={() => {}}
      />
    );
    // Tried completed first and succeeded — no error banner, spec rendered.
    expect(await screen.findByText("Done.")).toBeTruthy();
    expect(gw.backlog_content).toHaveBeenCalledWith("completed", "0001-x.md");
    expect(screen.queryByText(/Failed to load the spec/)).toBeNull();
    // Resolved kind is displayed.
    expect(screen.getByText(/completed • 0001-x.md/)).toBeTruthy();
  });

  it("falls through completed→planned when the archive misses", async () => {
    const gw = base_gateway();
    gw.backlog_content = vi.fn(async (kind: string, filename: string) => {
      if (kind === "planned") return { kind, filename, content: "# Planned spec\n\n## Summary\nStill planned." };
      throw new Error("404");
    });
    render(
      <WorkItemDrawer
        gateway={gw}
        can_use_gateway={true}
        target={{ filename: "0002-y.md", kind: null, request_id: "r_f", title: "Failed thing" }}
        on_close={() => {}}
        on_mutated={async () => {}}
        on_open_executions={() => {}}
      />
    );
    expect(await screen.findByText("Still planned.")).toBeTruthy();
    expect(gw.backlog_content.mock.calls.map((c: any[]) => c[0])).toEqual(["completed", "planned"]);
  });

  it("batch targets (no filename) match runs by request_id only", async () => {
    const gw = base_gateway();
    gw.backlog_content = vi.fn(async () => {
      throw new Error("never called for batch");
    });
    gw.backlog_exec_requests = vi.fn(async (opts: any) => {
      const status = String(opts?.status || "");
      if (status.includes("queued")) {
        return {
          ok: true,
          requests: [
            { request_id: "r_batch", status: "running", created_at: "2026-07-12T10:00:00Z", backlog_filename: "batch(2)" },
            // A foreign filename-less request must NOT be adopted.
            { request_id: "r_other", status: "running", created_at: "2026-07-12T10:01:00Z", backlog_filename: "" },
          ],
        };
      }
      return { ok: true, requests: [] };
    });
    render(
      <WorkItemDrawer
        gateway={gw}
        can_use_gateway={true}
        target={{ filename: "", kind: null, request_id: "r_batch", title: "Batch execution (2 items)", initial_tab: "runs" }}
        on_close={() => {}}
        on_mutated={async () => {}}
        on_open_executions={() => {}}
      />
    );
    await waitFor(() => expect(gw.backlog_exec_requests).toHaveBeenCalled());
    // Only the batch's own request renders in Runs.
    expect(await screen.findByText(/r_batch/)).toBeTruthy();
    expect(screen.queryByText(/r_other/)).toBeNull();
    // Spec tab shows the honest batch message (switch back to Spec).
    fireEvent.click(screen.getByRole("button", { name: "Spec" }));
    expect(await screen.findByText(/No spec file for this card/)).toBeTruthy();
  });

  it("promote is two-step (arm, then confirm names prod + redeploy)", async () => {
    const gw = base_gateway();
    gw.backlog_content = vi.fn(async (kind: string, filename: string) => ({
      kind,
      filename,
      content: "# t\n\n## Summary\nS.\n\n## Acceptance Criteria\n- [ ] crit-1\n",
    }));
    gw.backlog_exec_requests = vi.fn(async (opts: any) => {
      const status = String(opts?.status || "");
      if (status.includes("queued")) {
        return { ok: true, requests: [{ request_id: "r_qa", status: "awaiting_qa", created_at: "2026-07-12T10:00:00Z", backlog_filename: "0003-z.md" }] };
      }
      return { ok: true, requests: [] };
    });
    render(
      <WorkItemDrawer
        gateway={gw}
        can_use_gateway={true}
        target={{ filename: "0003-z.md", kind: "planned", request_id: "r_qa", title: "QA thing", has_live_request: true, initial_tab: "review" }}
        on_close={() => {}}
        on_mutated={async () => {}}
        on_open_executions={() => {}}
      />
    );
    const arm = await screen.findByRole("button", { name: /Promote \(override\)…|Approve → promote…/ });
    fireEvent.click(arm);
    expect(gw.backlog_exec_promote).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("button", { name: /Confirm: promote to prod/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(gw.backlog_exec_promote).toHaveBeenCalledWith({ request_id: "r_qa", redeploy: true }));
  });
});
