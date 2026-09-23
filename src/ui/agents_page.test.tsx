// @vitest-environment jsdom
//
// Pins for the Agents & Entities workforce console: the entity roster
// renders from the gateway registry, degrades independently of the agent
// half (#FALLBACK label), and the executor card reflects exec config.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentsPage } from "./agents_page";

function make_gateway(overrides: Record<string, any> = {}) {
  return {
    backlog_exec_config: vi.fn(async () => ({
      ok: true,
      runner_enabled: true,
      runner_alive: true,
      can_execute: true,
      executor: "codex_cli",
      codex_model: "gpt-5.2",
    })),
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    list_entities: vi.fn(async () => ({
      entities: [
        {
          entity_id: "entity:castor@home-fd023c86",
          name: "castor",
          slug: "castor",
          created_at: "2026-07-07T06:05:36Z",
          files: { spark: true, memory: true, book: true },
          state: { state: "asleep", reason: "by the operator (roster)" },
        },
      ],
    })),
    ...overrides,
  } as any;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AgentsPage (workforce console)", () => {
  it("renders summoned entities from the gateway registry with state", async () => {
    const gw = make_gateway();
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    expect(await screen.findByText("castor")).toBeTruthy();
    expect(screen.getByText("entity:castor@home-fd023c86")).toBeTruthy();
    expect(screen.getByText("asleep")).toBeTruthy();
    expect(screen.getByText(/by the operator/)).toBeTruthy();
  });

  it("renders STOPPED in danger tone from the served liveness field, never client-derived", async () => {
    const gw = make_gateway({
      list_entities: vi.fn(async () => ({
        entities: [
          {
            entity_id: "entity:ephemeral@home-1",
            name: "ephemeral",
            slug: "ephemeral",
            files: {},
            // The wire truth (gateway c2149): state=paused serves as
            // liveness=stopped. The badge must come from the FIELD.
            state: { state: "paused", reason: "kill switch" },
            liveness: "stopped",
          },
          {
            entity_id: "entity:hypnos@home-2",
            name: "hypnos",
            slug: "hypnos",
            files: {},
            // Asleep but ALIVE — must NOT render stopped (the exact
            // distinction the liveness axis exists to draw).
            state: { state: "asleep", reason: "graceful rest" },
            liveness: "alive",
          },
        ],
      })),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    const stopped = await screen.findByText("STOPPED");
    expect(stopped.className).toContain("danger");
    // The stopped card shows the badge INSTEAD of the raw state chip...
    expect(screen.queryByText("paused")).toBeNull();
    // ...while the alive-asleep entity keeps its ordinary state chip.
    expect(screen.getByText("asleep")).toBeTruthy();
  });

  it("keeps the ordinary state chip when the wire carries no liveness field (older gateway)", async () => {
    const gw = make_gateway({
      list_entities: vi.fn(async () => ({
        entities: [
          {
            entity_id: "entity:castor@home-3",
            name: "castor",
            slug: "castor",
            files: {},
            state: { state: "paused", reason: "old build" },
          },
        ],
      })),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    // Feature-detect honesty: no field, no STOPPED fabrication.
    expect(await screen.findByText("paused")).toBeTruthy();
    expect(screen.queryByText("STOPPED")).toBeNull();
  });

  it("entity Wake/Sleep verbs post through the gateway door and re-render from its truth", async () => {
    const asleep = { entity_id: "entity:castor@h1", name: "castor", slug: "castor", files: {}, state: { state: "asleep", reason: "night" } };
    const awake = { ...asleep, state: { state: "awake", reason: "woken" } };
    // First read (mount refresh) serves asleep; every later read — the
    // verb's refetch — serves awake. The card must re-render from the
    // REFETCHED wire truth, not a local state guess (adversary find: the
    // earlier pin passed without the refetch ever running).
    const list_entities = vi.fn().mockResolvedValueOnce({ entities: [asleep] }).mockResolvedValue({ entities: [awake] });
    const gw = make_gateway({
      entity_state: vi.fn(async () => ({ ok: true })),
      admin_runtime_config: vi.fn(async () => ({ writable: true })),
      list_entities,
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Wake" }));
    await waitFor(() => expect(gw.entity_state).toHaveBeenCalledWith("castor", expect.objectContaining({ state: "awake" })));
    await screen.findByRole("button", { name: "Sleep" });
    expect(list_entities.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the verb refusal verbatim (the gateway is the authority)", async () => {
    const gw = make_gateway({
      entity_state: vi.fn(async () => {
        throw new Error("entity_state failed: 409 a visit is live");
      }),
      list_entities: vi.fn(async () => ({
        entities: [{ entity_id: "entity:castor@h1", name: "castor", slug: "castor", files: {}, state: { state: "awake" } }],
      })),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sleep" }));
    await screen.findByText(/409 a visit is live/);
  });

  it("Set as default appears only with write authority and posts the registry id", async () => {
    const gw = make_gateway({
      admin_runtime_config: vi.fn(async () => ({ writable: true })),
      admin_runtime_config_update: vi.fn(async () => ({ writable: true })),
      admin_executors: vi.fn(async () => [
        { id: "codex_cli", display: "Codex CLI", available: true, default: true },
        { id: "claude_code", display: "Claude Code", available: true },
      ]),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(gw.admin_runtime_config_update).toHaveBeenCalledWith({ executor: "claude_code" }));
  });

  it("hides Set as default without write authority (read-only truth, no fake buttons)", async () => {
    const gw = make_gateway({
      admin_runtime_config: vi.fn(async () => ({ writable: false })),
      admin_executors: vi.fn(async () => [
        { id: "codex_cli", display: "Codex CLI", available: true, default: true },
        { id: "claude_code", display: "Claude Code", available: true },
      ]),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    await screen.findByText("Claude Code");
    expect(screen.queryByRole("button", { name: "Set as default" })).toBeNull();
  });

  it("the advisor card's action opens the shell assistant drawer", async () => {
    const gw = make_gateway();
    const open_assistant = vi.fn();
    render(<AgentsPage gateway={gw} gateway_connected={true} on_open_assistant={open_assistant} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask the advisor" }));
    expect(open_assistant).toHaveBeenCalledTimes(1);
  });

  it("capabilities rows carry status chips and their live jumps (never a dead placard)", async () => {
    const gw = make_gateway();
    const open_team = vi.fn();
    const open_executions = vi.fn();
    render(<AgentsPage gateway={gw} gateway_connected={true} on_open_team={open_team} on_open_executions={open_executions} />);
    // Live rows link to their surface.
    fireEvent.click(await screen.findByRole("button", { name: "Open Team" }));
    expect(open_team).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Executions" }));
    expect(open_executions).toHaveBeenCalledTimes(1);
    // Pending rows say so honestly instead of offering nothing silently.
    expect(screen.getByText("pending contract")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
  });

  it("entity registry failure degrades to a labeled #FALLBACK without killing the agent roster", async () => {
    const gw = make_gateway({
      list_entities: vi.fn(async () => {
        throw new Error("404 no entity lane");
      }),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    // Executor card still renders...
    expect(await screen.findByText("codex_cli")).toBeTruthy();
    // ...and the entity pane says why it is empty.
    expect(screen.getByText(/#FALLBACK entity registry unavailable/)).toBeTruthy();
  });

  it("shows the honest empty state when no entities exist", async () => {
    const gw = make_gateway({ list_entities: vi.fn(async () => ({ entities: [] })) });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    await waitFor(() => expect(gw.list_entities).toHaveBeenCalled());
    expect(await screen.findByText(/No summoned entities on this gateway yet/)).toBeTruthy();
  });

  it("renders executor registry rows when the c1554 surface serves them", async () => {
    const gw = make_gateway({
      admin_executors: vi.fn(async () => [
        { id: "codex", display: "Codex CLI", available: true, default: true, models: ["gpt-5.2"] },
        { id: "abstractcode", display: "AbstractCode", available: false },
      ]),
    });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    expect(await screen.findByText("Codex CLI")).toBeTruthy();
    expect(screen.getByText("AbstractCode")).toBeTruthy();
    expect(screen.getByText("unavailable")).toBeTruthy();
    // The default renders twice by design since the actionable wave: the
    // card sub names it AND the actions row carries the default chip.
    expect(screen.getAllByText(/gateway default/).length).toBeGreaterThan(0);
  });

  it("falls back to the exec-config card when the registry answers empty", async () => {
    const gw = make_gateway({ admin_executors: vi.fn(async () => []) });
    render(<AgentsPage gateway={gw} gateway_connected={true} />);
    // Empty registry must NOT suppress the single-executor posture card.
    expect(await screen.findByText("codex_cli")).toBeTruthy();
  });
});
