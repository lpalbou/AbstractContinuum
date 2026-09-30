// @vitest-environment jsdom
//
// On/off settings are kit switches labelled by the feature (state-toggles
// rule, 2026-09-30): the switch position IS the state, it applies at once,
// a refused change reverts with the reason, and a principal who may not
// change it sees the switch unavailable with the reason, never an
// "Enable"/"Disable" button beside a state chip.
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { findVerbToggleLabels } from "@abstractframework/ui-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecEventsView } from "./backlog/exec_events_view";
import { ProcessesPage } from "./processes_page";
import { SettingsPage, type ContinuumSettings } from "./settings_page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const SETTINGS: ContinuumSettings = {
  maintenance_ai_provider: "",
  maintenance_ai_model: "",
  maintenance_ai_reasoning: "",
  backlog_advisor_agent: "",
  default_execution_mode: "uat",
};

function cfg(overrides: Record<string, unknown> = {}) {
  return {
    writable: true,
    process_manager: { value: false, source: "default" },
    backlog_exec_runner: { value: true, source: "stored" },
    triage_repo_root: { value: "/x", source: "stored" },
    executors: [],
    ...overrides,
  };
}

function stub_gateway(config: Record<string, unknown> | null, update?: (patch: any) => Promise<any>) {
  // The gateway keeps what it saved: the page re-reads the config after a change.
  let current = config;
  const save = async (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...(current || {}) };
    for (const [k, v] of Object.entries(patch)) next[k] = { value: v, source: "stored" };
    current = next;
    return next;
  };
  return {
    backlog_exec_config: vi.fn(async () => ({ runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex" })),
    admin_runtime_config: vi.fn(async () => {
      if (!current) throw new Error("404 not found");
      return current;
    }),
    admin_runtime_config_update: vi.fn(update ?? save),
    admin_data_homes: vi.fn(async () => ({ homes: [], warnings: [] })),
    list_processes: vi.fn(async () => ({ enabled: true, processes: [] })),
    backlog_template: vi.fn(async () => ({ template: "" })),
    discovery_providers: vi.fn(async () => ({ items: [] })),
    discovery_provider_models: vi.fn(async () => ({ models: [] })),
    discovery_model_capabilities: vi.fn(async () => ({ model: "m", capabilities: {} })),
    list_bundles: vi.fn(async () => ({ items: [] })),
  };
}

function render_settings(gw: any): void {
  render(<SettingsPage gateway={gw} gateway_connected={true} settings={SETTINGS} set_settings={() => {}} />);
}

async function row_switch(testid: string, name: string): Promise<HTMLElement> {
  const row = await screen.findByTestId(testid);
  return within(row).getByRole("switch", { name });
}

describe("Settings — gateway administration switches", () => {
  it("renders Exec runner and Process manager as switches showing the saved state, no Enable/Disable buttons", async () => {
    render_settings(stub_gateway(cfg()));
    const exec = await row_switch("admin_row_exec_runner", "Exec runner");
    await waitFor(() => expect(exec.getAttribute("aria-checked")).toBe("true"));
    const pm = await row_switch("admin_row_process_manager", "Process manager");
    expect(pm.getAttribute("aria-checked")).toBe("false");
    expect(exec.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Enable|Disable)$/ })).toBeNull();
  });

  it("applies a switch at once and says the new state", async () => {
    const gw = stub_gateway(cfg());
    render_settings(gw);
    const pm = await row_switch("admin_row_process_manager", "Process manager");
    await waitFor(() => expect(gw.admin_runtime_config).toHaveBeenCalled());
    fireEvent.click(pm);
    await waitFor(() => expect(gw.admin_runtime_config_update).toHaveBeenCalledWith({ process_manager: true }));
    expect((await screen.findByTestId("admin_notice")).textContent).toBe("Process manager is on.");
    await waitFor(() => expect(screen.getByRole("switch", { name: "Process manager" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("a refused change keeps the old state and shows the gateway's words", async () => {
    const gw = stub_gateway(cfg(), async () => {
      throw new Error("refused: launch flag wins");
    });
    render_settings(gw);
    const exec = await row_switch("admin_row_exec_runner", "Exec runner");
    await waitFor(() => expect(exec.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(exec);
    expect(await screen.findByText("refused: launch flag wins")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Exec runner" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("admin_notice")).toBeNull();
  });

  it("a non-admin principal sees the switches unavailable with the reason, and a click sends nothing", async () => {
    const gw = stub_gateway(cfg({ writable: false }));
    render_settings(gw);
    const exec = await row_switch("admin_row_exec_runner", "Exec runner");
    await waitFor(() => expect(exec.getAttribute("aria-disabled")).toBe("true"));
    const reason = document.getElementById(String(exec.getAttribute("aria-describedby")));
    expect(reason?.textContent).toBe("Only a gateway admin can change this.");
    fireEvent.click(exec);
    expect(gw.admin_runtime_config_update).not.toHaveBeenCalled();
  });
});

describe("Settings — voice", () => {
  it("'Custom voice' is a switch that saves at once and reveals the voice fields", async () => {
    render_settings({ ...stub_gateway(cfg()), voice_voices: vi.fn(async () => ({ providers: ["p"] })) });
    const sw = await screen.findByRole("switch", { name: /Custom voice/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Provider")).toBeNull();
    fireEvent.click(sw);
    expect(screen.getByRole("switch", { name: /Custom voice/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Provider")).toBeTruthy();
    expect(screen.queryByText("Override the gateway default voice")).toBeNull();
  });
});

describe("Auto-refresh switches", () => {
  it("Processes: 'Auto-refresh' is a switch", async () => {
    const gw: any = { list_processes: vi.fn(async () => ({ ok: true, enabled: true, processes: [] })), list_process_env_vars: vi.fn(async () => ({ ok: true, enabled: true, vars: [] })) };
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    const sw = await screen.findByRole("switch", { name: "Auto-refresh" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(screen.getByRole("switch", { name: "Auto-refresh" }).getAttribute("aria-checked")).toBe("true");
  });

  it("Executions live log: 'Auto-refresh' is a switch, unavailable until an execution is picked", () => {
    const base = {
      exec_detail: null,
      is_compact_layout: false,
      exec_log_name: "events" as const,
      set_exec_log_name: () => {},
      exec_log_text: "",
      exec_log_loading: false,
      exec_log_error: "",
      exec_log_truncated: false,
      exec_log_scroll_el_ref: { current: null },
      exec_log_follow_ref: { current: true },
      parsed_exec_events: null,
      load_exec_log_tail: () => {},
    };
    const set_auto = vi.fn();
    const { unmount } = render(<ExecEventsView {...base} exec_selected={{ request_id: "r1" } as any} exec_log_auto={true} set_exec_log_auto={set_auto} />);
    const on = screen.getByRole("switch", { name: "Auto-refresh" });
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/Auto (on|off)/)).toBeNull();
    fireEvent.click(on);
    expect(set_auto).toHaveBeenCalledTimes(1);
    expect(set_auto.mock.calls[0][0](true)).toBe(false);
    unmount();
    render(<ExecEventsView {...base} exec_selected={{ request_id: "" } as any} exec_log_auto={false} set_exec_log_auto={set_auto} />);
    const off = screen.getByRole("switch", { name: "Auto-refresh" });
    expect(off.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Team: new channel", () => {
  it("'Private' is a switch in the create-channel form (source: the page needs a live hub to render)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "team_page.tsx"), "utf8");
    expect(src).toMatch(/<AfSwitch[^>]*?label="Private"[^>]*?action="new-channel-private"/s);
    expect(src).not.toMatch(/is_private: e\.target\.checked/);
  });
});

describe("source guard", () => {
  const SRC = path.resolve(__dirname, "..");
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
    }
    return out;
  }

  it("no verb-swap toggle labels anywhere in src (kit findVerbToggleLabels)", () => {
    const hits = walk(SRC).flatMap((file) =>
      findVerbToggleLabels(fs.readFileSync(file, "utf8")).map((h) => `${path.relative(SRC, file)}:${h.line} ${h.labels.join(" / ")}`),
    );
    expect(hits).toEqual([]);
  });

  it("the guard flags a verb swap (it is not decoration)", () => {
    expect(findVerbToggleLabels('x ? "Auto on" : "Auto off"')).toHaveLength(1);
  });
});
