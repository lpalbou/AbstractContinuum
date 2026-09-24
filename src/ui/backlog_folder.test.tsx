// @vitest-environment jsdom
//
// Backlog folder states (gateway mission II, operator 2026-09-24: "fix
// continuum for a new fresh install ... no environment variables"):
//  - fresh gateway: the folder is the gateway's own, the board is EMPTY —
//    an empty state with the path + Copy + "Create your first item", never a
//    setup box, never an environment variable;
//  - folder not available (vanished saved path): path + reason, and for an
//    admin "Use the gateway's own folder" / "Choose a folder…" through the
//    settings door (the gateway's refusal shown as is);
//  - non-admin: who fixes it and where, no actions;
//  - older gateway (no status endpoint, old 404 wording): still the panel,
//    "Choose a folder…" only.
// Plus the Settings page: the backlog folder / exec runner rows with their
// source pill and no env text.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardPage } from "./board/board_page";
import { is_backlog_unavailable } from "./backlog_folder";
import { SettingsPage, type ContinuumSettings } from "./settings_page";

const UNAVAILABLE_404 =
  "backlog_list failed: Backlog folder not available on this gateway: the folder does not exist (set by the saved setting). An admin sets it in Continuum's Settings, the gateway console (Apps -> Backlog settings), or with `abstractgateway config set triage_repo_root PATH`.";

function make_board_gateway(opts: { items?: boolean; status?: any; list_error?: string; status_error?: any; writable?: boolean }) {
  const planned = opts.items ? [{ kind: "planned", filename: "0001-x.md", item_id: 1, package: "x", title: "An item", task_type: "task", parsed: true }] : [];
  const gateway: any = {
    backlog_list: vi.fn(async (kind: string) => {
      if (opts.list_error) throw new Error(opts.list_error);
      return { items: kind === "planned" ? planned : [] };
    }),
    backlog_exec_requests: vi.fn(async () => {
      if (opts.list_error) throw new Error(opts.list_error.replace("backlog_list", "backlog_exec_requests"));
      return { ok: true, requests: [] };
    }),
    backlog_exec_active_items: vi.fn(async () => ({ ok: true, items: [] })),
    backlog_content: vi.fn(async () => ({ content: "" })),
    backlog_exec_config: vi.fn(async () => ({ ok: true, runner_enabled: false, runner_alive: false, can_execute: false, executor: "codex" })),
    backlog_status: vi.fn(async () => {
      if (opts.status_error) throw opts.status_error;
      return opts.status;
    }),
    admin_runtime_config: vi.fn(async () => ({ writable: opts.writable === true })),
    admin_runtime_config_update: vi.fn(async () => ({ writable: true })),
  };
  return gateway;
}

function render_board(gw: any, on_new_task?: () => void) {
  return render(
    <BoardPage gateway={gw} gateway_connected={true} data_nonce={0} on_mutated={() => {}} on_open_executions={() => {}} on_new_task={on_new_task} />
  );
}

function no_env_text(): void {
  const text = document.body.textContent || "";
  expect(text).not.toMatch(/ABSTRACT[A-Z_]*=|ABSTRACTGATEWAY_|environment variable|setup required/i);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("is_backlog_unavailable", () => {
  it("matches the new and the pre-setting 404 wordings, nothing else", () => {
    expect(is_backlog_unavailable(new Error(UNAVAILABLE_404))).toBe(true);
    expect(is_backlog_unavailable(new Error("backlog_list failed: Backlog browsing not configured on this gateway"))).toBe(true);
    expect(is_backlog_unavailable(new Error("backlog_list failed: Backlog template not found (docs/backlog/template.md)"))).toBe(false);
    expect(is_backlog_unavailable("")).toBe(false);
  });
});

describe("Board — backlog folder states", () => {
  it("fresh gateway: empty state with the folder, Copy, and Create your first item — no setup box, no env text", async () => {
    const gw = make_board_gateway({
      status: { available: true, source: "default", path: "/data/backlog", is_default: true, writable: true, template_relpath: "docs/backlog/template.md" },
    });
    const on_new_task = vi.fn();
    render_board(gw, on_new_task);
    expect(await screen.findByText("Your backlog is empty")).toBeTruthy();
    expect(screen.getByText("/data/backlog")).toBeTruthy();
    expect(screen.getByText("/data/backlog/docs/backlog/proposed/")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create your first item" }));
    expect(on_new_task).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("backlog_unavailable")).toBeNull();
    no_env_text();
  });

  it("items present: no empty state", async () => {
    const gw = make_board_gateway({ items: true, status: { available: true, source: "stored", path: "/repo", writable: true } });
    render_board(gw, () => {});
    expect(await screen.findByText("An item")).toBeTruthy();
    expect(screen.queryByText("Your backlog is empty")).toBeNull();
  });

  it("folder not available, admin: path + reason, and Use the gateway's own folder posts the setting", async () => {
    const gw = make_board_gateway({
      list_error: UNAVAILABLE_404,
      status: {
        available: false,
        source: "stored",
        path: "/gone/project",
        reason: "the folder does not exist (set by the saved setting)",
        writable: true,
        default_path: "/data/backlog",
      },
    });
    render_board(gw);
    expect(await screen.findByText("This gateway's backlog folder is not available")).toBeTruthy();
    expect(screen.getByText("/gone/project")).toBeTruthy();
    expect(screen.getAllByText(/the folder does not exist \(set by the saved setting\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Your backlog is empty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use the gateway's own folder" }));
    await waitFor(() => expect(gw.admin_runtime_config_update).toHaveBeenCalledWith({ triage_repo_root: "/data/backlog" }));
    // After the change the status is refetched.
    await waitFor(() => expect(gw.backlog_status.mock.calls.length).toBeGreaterThan(1));
    no_env_text();
  });

  it("Choose a folder…: the gateway validates, its refusal is shown as is", async () => {
    const gw = make_board_gateway({
      list_error: UNAVAILABLE_404,
      status: { available: false, source: "stored", path: "/gone", reason: "the folder does not exist (set by the saved setting)", writable: true, default_path: "/data/backlog" },
    });
    gw.admin_runtime_config_update = vi.fn(async () => {
      throw new Error(
        "admin_runtime_config_update failed: triage_repo_root '/tmp/nothing' cannot be the backlog folder: it has no docs/backlog folder. Choose a folder that contains docs/backlog, or use the gateway's own folder /data/backlog (created for you)."
      );
    });
    render_board(gw);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a folder…" }));
    fireEvent.change(screen.getByLabelText(/contains docs\/backlog/), { target: { value: "/tmp/nothing" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));
    await waitFor(() => expect(gw.admin_runtime_config_update).toHaveBeenCalledWith({ triage_repo_root: "/tmp/nothing" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^triage_repo_root '\/tmp\/nothing' cannot be the backlog folder: it has no docs\/backlog folder/);
  });

  it("folder not available, non-admin: who fixes it and where, no actions, no path", async () => {
    const gw = make_board_gateway({
      list_error: UNAVAILABLE_404,
      status: { available: false, source: "stored", reason: "the folder does not exist (set by the saved setting)", writable: false },
    });
    render_board(gw);
    expect(await screen.findByText(/Ask the gateway admin to set the backlog folder/)).toBeTruthy();
    expect(screen.getByText("abstractgateway config set triage_repo_root PATH")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use the gateway's own folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose a folder…" })).toBeNull();
    no_env_text();
  });

  it("older gateway (no status endpoint, old wording): the panel with Choose a folder… only", async () => {
    const e404: any = new Error("backlog_status failed: Not Found");
    e404.status = 404;
    const gw = make_board_gateway({
      list_error: "backlog_list failed: Backlog browsing not configured on this gateway",
      status_error: e404,
      writable: true,
    });
    render_board(gw);
    expect(await screen.findByText("This gateway's backlog folder is not available")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Choose a folder…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use the gateway's own folder" })).toBeNull();
    no_env_text();
  });
});

const SETTINGS: ContinuumSettings = {
  maintenance_ai_provider: "",
  maintenance_ai_model: "",
  maintenance_ai_reasoning: "",
  backlog_advisor_agent: "",
  default_execution_mode: "uat",
};

function settings_gateway(cfg: any) {
  return {
    backlog_exec_config: vi.fn(async () => ({ runner_enabled: false, runner_alive: false, can_execute: false, executor: "codex" })),
    admin_runtime_config: vi.fn(async () => cfg),
    admin_runtime_config_update: vi.fn(async () => cfg),
    admin_data_homes: vi.fn(async () => ({ homes: [], warnings: [] })),
    list_processes: vi.fn(async () => ({ enabled: false, processes: [] })),
    backlog_template: vi.fn(async () => ({ template: "" })),
    discovery_providers: vi.fn(async () => ({ items: [] })),
    discovery_provider_models: vi.fn(async () => ({ models: [] })),
    discovery_model_capabilities: vi.fn(async () => ({ model: "m", capabilities: {} })),
    list_bundles: vi.fn(async () => ({ items: [] })),
  };
}

describe("Settings — backlog folder and exec runner", () => {
  it("shows each setting's source in words, the admin can switch to the gateway's own folder, no env text", async () => {
    const cfg = {
      writable: true,
      triage_repo_root: {
        value: "/old/project",
        source: "env",
        available: true,
        default_path: "/data/backlog",
        label: "Backlog folder",
        help: "The folder whose docs/backlog holds the backlog items Continuum shows.",
      },
      backlog_exec_runner: { value: true, source: "flag", label: "Backlog exec runner", help: "Runs queued items." },
      process_manager: { value: false, source: "default", help: "Powers the Services page." },
      executor: { value: "codex", source: "stored" },
      executors: [{ id: "codex", display: "Codex CLI", available: true }],
    };
    const gw = settings_gateway(cfg);
    render(<SettingsPage gateway={gw as any} gateway_connected={true} settings={SETTINGS} set_settings={() => {}} />);
    const row = await screen.findByTestId("admin_row_backlog_folder");
    await waitFor(() => expect(row.textContent).toContain("environment (legacy)"));
    expect(row.textContent).toContain("/old/project");
    expect(row.textContent).toContain("available");
    const pills = screen.getAllByTestId("source_chip").map((el) => el.textContent);
    expect(pills).toEqual(expect.arrayContaining(["environment (legacy)", "launch flag", "default", "setting"]));
    fireEvent.click(screen.getByRole("button", { name: "Use the gateway's own folder" }));
    await waitFor(() => expect(gw.admin_runtime_config_update).toHaveBeenCalledWith({ triage_repo_root: "/data/backlog" }));
    no_env_text();
  });

  it("a folder that is not available reads as not available, with the reason", async () => {
    const cfg = {
      writable: true,
      triage_repo_root: { value: "/gone", source: "stored", available: false, reason: "the folder does not exist (set by the saved setting)", default_path: "/data/backlog" },
      backlog_exec_runner: { value: false, source: "default" },
      process_manager: { value: false, source: "default" },
    };
    render(<SettingsPage gateway={settings_gateway(cfg) as any} gateway_connected={true} settings={SETTINGS} set_settings={() => {}} />);
    const row = await screen.findByTestId("admin_row_backlog_folder");
    await waitFor(() => expect(row.textContent).toContain("not available: the folder does not exist"));
    expect(row.textContent).toContain("setting");
  });
});
