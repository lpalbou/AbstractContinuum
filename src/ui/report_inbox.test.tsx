// @vitest-environment jsdom
//
// Behavior tests for the Inbox page: triage decisions (Messages tab),
// bug/feature report lists + content loading, the triage run action, and
// decision apply flows.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportInboxPage } from "./report_inbox";

function make_stub_gateway() {
  const decisions = [
    {
      decision_id: "dec_1",
      report_type: "bug",
      report_relpath: "reports/bugs/2026-07-12-broken-door.md",
      status: "pending",
      created_at: "2026-07-12T09:00:00Z",
      missing_fields: [],
      duplicates: [],
    },
  ];
  const bugs = [{ report_type: "bug", filename: "2026-07-12-broken-door.md", relpath: "reports/bugs/2026-07-12-broken-door.md", title: "Broken door" }];
  const features = [{ report_type: "feature", filename: "2026-07-12-new-window.md", relpath: "reports/features/2026-07-12-new-window.md", title: "New window" }];

  const gateway: any = {
    list_triage_decisions: vi.fn(async () => ({ decisions })),
    list_bug_reports: vi.fn(async () => ({ items: bugs })),
    list_feature_requests: vi.fn(async () => ({ items: features })),
    get_bug_report_content: vi.fn(async (filename: string) => ({ report_type: "bug", filename, relpath: `reports/bugs/${filename}`, content: "# Bug body" })),
    get_feature_request_content: vi.fn(async (filename: string) => ({
      report_type: "feature",
      filename,
      relpath: `reports/features/${filename}`,
      content: "# Feature body",
    })),
    triage_run: vi.fn(async () => ({ ok: true, reports: 3, updated_decisions: 1, decisions_dir: "x", drafts_written: [] })),
    apply_triage_decision: vi.fn(async (decision_id: string, args: any) => ({ ...decisions[0], decision_id, status: args.action === "approve" ? "approved" : "rejected" })),
    email_list_accounts: vi.fn(async () => ({ ok: true, accounts: [] })),
    backlog_content: vi.fn(async () => ({ kind: "proposed", filename: "x.md", content: "# Draft" })),
  };
  return gateway;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReportInboxPage", () => {
  it("loads triage decisions on mount (Messages tab)", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={true} />);

    await waitFor(() => expect(gw.list_triage_decisions).toHaveBeenCalled());
    expect(await screen.findByText(/broken-door/)).toBeTruthy();
  });

  it("runs triage and reports the outcome", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={true} />);
    await screen.findByText(/broken-door/);

    fireEvent.click(screen.getByRole("button", { name: /Run triage/i }));
    await waitFor(() => expect(gw.triage_run).toHaveBeenCalledWith({ write_drafts: false, enable_llm: false }));
    expect(await screen.findByText(/Scanned 3 report/)).toBeTruthy();
  });

  it("lists bug reports and loads content on selection", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={true} />);
    await screen.findByText(/broken-door/);

    fireEvent.click(screen.getByRole("button", { name: "Bugs" }));
    await waitFor(() => expect(gw.list_bug_reports).toHaveBeenCalled());
    fireEvent.click(await screen.findByText("Broken door"));
    await waitFor(() => expect(gw.get_bug_report_content).toHaveBeenCalledWith("2026-07-12-broken-door.md"));
    expect(await screen.findByText("Bug body")).toBeTruthy();
  });

  it("lists feature requests on the Features tab", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={true} />);
    await screen.findByText(/broken-door/);

    fireEvent.click(screen.getByRole("button", { name: "Features" }));
    await waitFor(() => expect(gw.list_feature_requests).toHaveBeenCalled());
    expect(await screen.findByText("New window")).toBeTruthy();
  });

  it("applies a triage decision", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={true} />);

    fireEvent.click(await screen.findByText(/broken-door/));
    await waitFor(() => expect(gw.get_bug_report_content).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: /Approve/i }));
    await waitFor(() => expect(gw.apply_triage_decision).toHaveBeenCalledWith("dec_1", expect.objectContaining({ action: "approve" })));
  });

  it("hides triage tabs when triage is disabled (email only)", async () => {
    const gw = make_stub_gateway();
    render(<ReportInboxPage gateway={gw} gateway_connected={true} enable_triage={false} />);
    await waitFor(() => expect(gw.email_list_accounts).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Bugs" })).toBeNull();
    expect(gw.list_triage_decisions).not.toHaveBeenCalled();
  });
});
