// @vitest-environment jsdom
//
// Render pins for ExecDetailPane, focused on the promoted-request view
// (adversarial find 2026-07-12: two "Promotion" sections rendered for every
// promoted request) and the awaiting-QA action row.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecDetailPane } from "./exec_detail_pane";

function make_pipeline(overrides: Partial<any>): any {
  return {
    exec_selected: null,
    exec_detail: null,
    exec_detail_loading: false,
    exec_detail_error: "",
    exec_qa_feedback: "",
    set_exec_qa_feedback: vi.fn(),
    exec_qa_loading: false,
    exec_qa_error: "",
    event_stats: null,
    time_stats: { is_done: false, queue_delay_ms: null, run_ms: null, total_ms: null, age_ms: null },
    exec_log_name: "events",
    set_exec_log_name: vi.fn(),
    exec_log_text: "",
    exec_log_loading: false,
    exec_log_error: "",
    exec_log_truncated: false,
    exec_log_auto: true,
    set_exec_log_auto: vi.fn(),
    exec_log_scroll_el_ref: { current: null },
    exec_log_follow_ref: { current: true },
    parsed_exec_events: { total: 0, bad: 0, events: [], raw: "" },
    load_exec_log_tail: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExecDetailPane", () => {
  it("renders exactly one Promotion section for a promoted request", () => {
    const pipeline = make_pipeline({
      exec_selected: { request_id: "req_p", status: "promoted", backlog_filename: "0001-x.md" },
      exec_detail: {
        status: "promoted",
        promoted_at: "2026-07-12T10:00:00Z",
        promotion: { mode: "uat", copied: 12, deleted: 1, manifest_sha256: "abc123def456abc123def456" },
        promotion_report: { redeploy: { status: "ok" } },
      },
    });
    render(
      <ExecDetailPane
        pipeline={pipeline}
        is_compact_layout={false}
        on_back_to_list={() => {}}
        on_send_feedback={() => {}}
        on_promote={() => {}}
        on_deploy_uat={() => {}}
      />
    );
    expect(screen.getAllByText("Promotion")).toHaveLength(1);
    // Fact-grid label (2026-07-14 restyle: UI-font label-over-value cells
    // replaced the key:value mono rows).
    expect(screen.getByText("promoted at")).toBeTruthy();
  });

  it("shows the QA action row for awaiting_qa requests", () => {
    const pipeline = make_pipeline({
      exec_selected: { request_id: "req_qa", status: "awaiting_qa", backlog_filename: "0002-y.md" },
      exec_detail: { status: "awaiting_qa", execution_mode: "uat", uat_lock_acquired: true },
    });
    render(
      <ExecDetailPane
        pipeline={pipeline}
        is_compact_layout={false}
        on_back_to_list={() => {}}
        on_send_feedback={() => {}}
        on_promote={() => {}}
        on_deploy_uat={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Approve → promote to prod" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Iterate (send feedback)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart UAT" })).toBeTruthy();
  });

  it("still shows promotion data for a non-promoted detail payload carrying it", () => {
    const pipeline = make_pipeline({
      exec_selected: { request_id: "req_c", status: "completed", backlog_filename: "0003-z.md" },
      exec_detail: { status: "completed", promotion: { mode: "uat", copied: 3 } },
    });
    render(
      <ExecDetailPane
        pipeline={pipeline}
        is_compact_layout={false}
        on_back_to_list={() => {}}
        on_send_feedback={() => {}}
        on_promote={() => {}}
        on_deploy_uat={() => {}}
      />
    );
    expect(screen.getAllByText("Promotion")).toHaveLength(1);
  });

  it("renders the skills-union verdicts (active with hash, held with reason) — gateway c1749/c1778 payload", () => {
    const pipeline = make_pipeline({
      exec_selected: { request_id: "req_s", status: "completed", backlog_filename: "0004-s.md" },
      exec_detail: {
        status: "completed",
        skills: {
          requested: ["coredoc", "backlog"],
          active: ["coredoc"],
          resolved_tree_hashes: { coredoc: "1be6061cfabd4d9f0000" },
          verdicts: [{ name: "backlog", status: "held", reason: "advisory block: pending re-pin" }],
          source: "item-class-defaults∪member",
        },
      },
    });
    render(
      <ExecDetailPane
        pipeline={pipeline}
        is_compact_layout={false}
        on_back_to_list={() => {}}
        on_send_feedback={() => {}}
        on_promote={() => {}}
        on_deploy_uat={() => {}}
      />
    );
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("coredoc")).toBeTruthy();
    // The held default renders WITH its reason, never silently absent.
    expect(screen.getByText(/backlog: advisory block: pending re-pin/)).toBeTruthy();
    expect(screen.getByText(/item-class-defaults/)).toBeTruthy();
  });

  it("renders no Skills section when the payload lacks the field (feature-detect on older gateways)", () => {
    const pipeline = make_pipeline({
      exec_selected: { request_id: "req_ns", status: "completed", backlog_filename: "0005-ns.md" },
      exec_detail: { status: "completed" },
    });
    render(
      <ExecDetailPane
        pipeline={pipeline}
        is_compact_layout={false}
        on_back_to_list={() => {}}
        on_send_feedback={() => {}}
        on_promote={() => {}}
        on_deploy_uat={() => {}}
      />
    );
    expect(screen.queryByText("Skills")).toBeNull();
  });
});
