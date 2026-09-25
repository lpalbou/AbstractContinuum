// @vitest-environment jsdom
//
// Settings pins — the Data & Caches telemetry card (claim receipt) and the
// admin-pane authority rendering. The card is READ-ONLY BY DESIGN (the
// cache-management split ruling: purge verbs live on the gateway console);
// these pins hold the feature-detect honesty: an older gateway renders the
// pending note, never dead UI or a fabricated table.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage, type ContinuumSettings } from "./settings_page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SETTINGS: ContinuumSettings = {
  maintenance_ai_provider: "",
  maintenance_ai_model: "",
  maintenance_ai_reasoning: "",
  backlog_advisor_agent: "",
  default_execution_mode: "uat",
};

type GatewayStub = {
  backlog_exec_config: ReturnType<typeof vi.fn>;
  admin_runtime_config: ReturnType<typeof vi.fn>;
  admin_runtime_config_update: ReturnType<typeof vi.fn>;
  admin_data_homes: ReturnType<typeof vi.fn>;
  list_processes: ReturnType<typeof vi.fn>;
  backlog_template: ReturnType<typeof vi.fn>;
  discovery_providers: ReturnType<typeof vi.fn>;
  discovery_provider_models: ReturnType<typeof vi.fn>;
  discovery_model_capabilities: ReturnType<typeof vi.fn>;
  list_bundles: ReturnType<typeof vi.fn>;
};

function stub_gateway(overrides: Partial<Record<keyof GatewayStub, any>> = {}): GatewayStub {
  return {
    backlog_exec_config: vi.fn(async () => ({ runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex" })),
    admin_runtime_config: vi.fn(async () => ({ writable: false, process_manager: { value: true, source: "env" }, triage_repo_root: { value: "/x", source: "env" } })),
    admin_runtime_config_update: vi.fn(async () => ({})),
    admin_data_homes: vi.fn(async () => ({ homes: [], warnings: [] })),
    list_processes: vi.fn(async () => ({ enabled: true, processes: [] })),
    backlog_template: vi.fn(async () => ({ template: "" })),
    discovery_providers: vi.fn(async () => ({ items: [] })),
    discovery_provider_models: vi.fn(async () => ({ models: [] })),
    discovery_model_capabilities: vi.fn(async () => ({ model: "m", capabilities: {} })),
    list_bundles: vi.fn(async () => ({ items: [] })),
    ...overrides,
  };
}

function render_page(gw: GatewayStub, connection?: any): void {
  render(
    <SettingsPage
      gateway={gw as any}
      gateway_connected={true}
      settings={SETTINGS}
      set_settings={() => {}}
      connection={connection}
    />
  );
}

/** The page renders several panes with tables (posture table in the admin
 *  pane) — scope every card assertion to the Data & Caches pane. */
function data_pane(): HTMLElement {
  const title = screen.getByText("Data and caches");
  const pane = title.closest(".pane") as HTMLElement;
  expect(pane).toBeTruthy();
  return pane;
}

describe("Settings — Data & Caches telemetry card", () => {
  it("renders the pending note when the gateway does not serve the registry (feature-detect, no dead UI)", async () => {
    const gw = stub_gateway({ admin_data_homes: vi.fn(async () => { throw new Error("404 not found"); }) });
    render_page(gw);
    await screen.findByText(/does not serve the data-homes registry yet/);
    expect(within(data_pane()).queryByRole("table")).toBeNull();
  });

  it("renders rows sorted by size with purgeable/protected/missing states and warnings", async () => {
    const gw = stub_gateway({
      admin_data_homes: vi.fn(async () => ({
        homes: [
          { name: "small_home", kind: "cache", owner: "core", size_bytes: 1_000, safe_to_purge: true, exists: true, path: "/a", description: "d1" },
          { name: "big_home", kind: "entity", owner: "gateway", size_bytes: 5_000_000_000, safe_to_purge: false, exists: true, path: "/b", description: "never purge" },
          { name: "gone_home", kind: "cache", owner: "core", size_bytes: 0, safe_to_purge: true, exists: false, path: "/c", description: "" },
        ],
        warnings: ["#FALLBACK one registry probe degraded"],
      })),
    });
    render_page(gw);

    await screen.findByText("big_home");
    const pane = data_pane();
    // Sort: biggest first (row order pins the size sort).
    const rows = within(pane).getAllByRole("row").slice(1); // drop thead row
    expect(rows[0].textContent).toContain("big_home");
    // States: protected on the never-purge home, purgeable on the cache,
    // missing chip when exists === false.
    expect(within(pane).getByText("protected")).toBeTruthy();
    expect(within(pane).getAllByText("purgeable").length).toBeGreaterThan(0);
    expect(within(pane).getByText("missing")).toBeTruthy();
    // Size formatting (5e9 → GB) and the count in the pane header.
    expect(within(pane).getByText("5.0 GB")).toBeTruthy();
    expect(within(pane).getByText("server-side — 3 registered homes")).toBeTruthy();
    // Warnings render verbatim (labeled degradation, never swallowed).
    expect(within(pane).getByText("#FALLBACK one registry probe degraded")).toBeTruthy();
    // Read-only by design: no purge buttons anywhere on this surface.
    expect(within(pane).queryByRole("button", { name: /purge/i })).toBeNull();
  });
});

describe("Settings — interim reasoning selector (reasoning-1st-citizen, delegate c5869)", () => {
  function render_with_model(gw: GatewayStub): void {
    render(
      <SettingsPage
        gateway={gw as any}
        gateway_connected={true}
        settings={{ ...SETTINGS, maintenance_ai_provider: "lmstudio", maintenance_ai_model: "qwen3-0.6b" }}
        set_settings={() => {}}
      />
    );
  }

  it("SUPPORTED: renders the model's own served levels, enabled", async () => {
    const gw = stub_gateway({
      discovery_model_capabilities: vi.fn(async () => ({ model: "qwen3-0.6b", capabilities: { thinking_support: true, reasoning_levels: ["low", "high"] } })),
    });
    render_with_model(gw);
    const select = (await screen.findByTestId("reasoning_select")).querySelector("select") as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(["", "low", "high"]); // served levels, never a client table
    expect(gw.discovery_model_capabilities).toHaveBeenCalledWith("qwen3-0.6b");
  });

  it("UNSUPPORTED: locked to none — a non-reasoning model naturally gets none", async () => {
    const gw = stub_gateway({
      discovery_model_capabilities: vi.fn(async () => ({ model: "qwen3-0.6b", capabilities: { thinking_support: false } })),
    });
    render_with_model(gw);
    const select = (await screen.findByTestId("reasoning_select")).querySelector("select") as HTMLSelectElement;
    await screen.findByText("none — this model doesn't reason");
    expect(select.disabled).toBe(true);
  });

  it("UNKNOWN (absent facts): locked fail-safe, and 'set anyway' unlocks the contract ladder", async () => {
    const gw = stub_gateway({
      discovery_model_capabilities: vi.fn(async () => ({ model: "qwen3-0.6b", capabilities: {} })),
    });
    render_with_model(gw);
    const box = await screen.findByTestId("reasoning_select");
    await screen.findByText("unknown — no served facts");
    const select = box.querySelector("select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/set anyway/));
    await waitFor(() => expect((box.querySelector("select") as HTMLSelectElement).disabled).toBe(false));
    const opts = Array.from((box.querySelector("select") as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(["", "minimal", "low", "medium", "high", "xhigh"]);
  });
});

describe("Settings — advisor workflow dropdown (operator 21:13)", () => {
  it("renders interface-declaring entrypoints from /bundles (the live wire shape), never the rest", async () => {
    const gw = stub_gateway({
      list_bundles: vi.fn(async () => ({
        items: [
          {
            bundle_id: "basic-agent",
            entrypoints: [{ flow_id: "main", name: "Basic agent", description: "chat agent", interfaces: ["chat"] }],
          },
          {
            bundle_id: "docs-qa@0.1.0",
            entrypoints: [{ flow_id: "qa", interfaces: ["chat"] }],
          },
          {
            // Scratch bundle: entrypoint WITHOUT an interface declaration
            // — not operator-selectable (observer c2193 reads the same
            // field the same way).
            bundle_id: "batch-cruncher",
            entrypoints: [{ flow_id: "run", interfaces: [] }],
          },
          {
            // Deprecated entrypoints are not candidates either.
            bundle_id: "old-agent",
            entrypoints: [{ flow_id: "main", interfaces: ["chat"], deprecated: true }],
          },
        ],
      })),
    });
    render_page(gw);
    const select = await screen.findByTitle(/Workflows the gateway can run/);
    const texts = Array.from((select as HTMLSelectElement).options).map((o) => o.text);
    expect(texts).toContain("basic-agent · Basic agent");
    expect(texts).toContain("docs-qa@0.1.0");
    expect(texts.some((t) => t.includes("batch-cruncher"))).toBe(false);
    expect(texts.some((t) => t.includes("old-agent"))).toBe(false);
    expect(texts).toContain("gateway default (basic-agent)");
    expect(texts.some((t) => t.includes("custom bundle id"))).toBe(true);
  });

  it("falls back to the free-text input when the catalog is not served (feature-detect, never dead UI)", async () => {
    const gw = stub_gateway({
      list_bundles: vi.fn(async () => {
        throw new Error("404 not found");
      }),
    });
    render_page(gw);
    expect(await screen.findByPlaceholderText("basic-agent")).toBeTruthy();
    expect(screen.queryByTitle(/Workflows the gateway can run/)).toBeNull();
  });
});

describe("Settings — admin pane authority rendering", () => {
  it("shows the signed-in principal and the not-admin read-only chip", async () => {
    const gw = stub_gateway();
    render_page(gw, { gateway: { principal: { user_id: "alice", admin: false } } });
    await screen.findByText("alice");
    await screen.findByText("not admin");
  });

  it("renders the admin chip for gateway admins", async () => {
    const gw = stub_gateway({
      admin_runtime_config: vi.fn(async () => ({ writable: true, process_manager: { value: false, source: "default" }, triage_repo_root: { value: "", source: "default" } })),
    });
    render_page(gw, { gateway: { principal: { user_id: "admin", admin: true } } });
    await screen.findByText("admin");
    await screen.findByText("gateway admin");
  });
});

describe("Settings — Hub seat (Continuum server setting)", () => {
  function view(seat: string, source: string) {
    return {
      settings: { hub_seat: { value: seat, source }, hub_token: { set: false, source: "default" } },
      writable: ["hub_seat"],
      settings_file: "/home/u/.abstractcontinuum/settings.json",
    };
  }

  it("shows the seat with its source and saves through the server", async () => {
    const calls: Array<{ method: string; body: string }> = [];
    const fetch_stub = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/continuum/settings");
      calls.push({ method: String(init?.method || "GET"), body: String(init?.body || "") });
      const payload = init?.method === "PUT" ? view(JSON.parse(String(init.body)).hub_seat, "setting") : view("operator", "env");
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch_stub);
    try {
      render_page(stub_gateway());
      const pane = await screen.findByTestId("admin_row_hub_seat");
      expect(within(pane).getByTestId("hub_seat_value").textContent).toBe("operator");
      expect(within(pane).getByTestId("hub_seat_source").textContent).toBe("environment (legacy)");
      expect(pane.textContent).toContain("abstractcontinuum config set hub_seat");
      expect(pane.textContent).not.toMatch(/ABSTRACTCONTINUUM_/);

      fireEvent.change(within(pane).getByLabelText("Hub seat"), { target: { value: "laurent" } });
      fireEvent.click(within(pane).getByText("Save"));
      await waitFor(() => expect(within(pane).getByTestId("hub_seat_source").textContent).toBe("setting"));
      expect(within(pane).getByTestId("hub_seat_value").textContent).toBe("laurent");
      expect(calls.filter((c) => c.method === "PUT")).toEqual([{ method: "PUT", body: JSON.stringify({ hub_seat: "laurent" }) }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("names the launch flag when it wins, and offers terminal routes when the server does not serve settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(view("flagseat", "flag")), { status: 200 }))
    );
    try {
      render_page(stub_gateway());
      const pane = await screen.findByTestId("admin_row_hub_seat");
      expect(within(pane).getByTestId("hub_seat_source").textContent).toBe("launch flag");
      expect(pane.textContent).toMatch(/restarts without it/);
    } finally {
      vi.unstubAllGlobals();
    }
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", { status: 200 })));
    try {
      render_page(stub_gateway());
      const pane = await screen.findByTestId("hub_seat_pane");
      await waitFor(() => expect(pane.textContent).toMatch(/--hub-seat <seat>/));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
