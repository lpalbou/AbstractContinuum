// @vitest-environment jsdom
//
// Shell pins: the connect modal is the FIRST thing a disconnected operator
// sees (maintainer ruling 2026-07-12) — auto-opened when the session
// status resolves signed-out, dismissible without a reopen loop, and never
// auto-opened over a live session. Since the unified top-bar adoption
// (uic c1648) that behavior lives in the kit's useGatewayConnection hook,
// which probes /api/connection/gateway itself — the tests stub the ROUTE,
// not a module binding.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";

beforeEach(() => {
  // The keep-alive assistant drawer mounts panel-chat's ChatThread, whose
  // stick-to-bottom autoscroll calls scrollIntoView — absent in jsdom.
  (Element.prototype as any).scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Route-aware fetch stub: the session route answers `connection`; every
 *  other gateway route answers a generic ok body. */
function stub_fetch(connection: any): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      if (url.includes("/api/connection/gateway")) {
        return new Response(JSON.stringify(connection), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, runs: [], items: [], requests: [], processes: [], entities: [] }), { status: 200 });
    })
  );
}

describe("App shell connect modal auto-open", () => {
  it("opens the connect modal when the session resolves signed-out, and dismiss does not reopen", async () => {
    stub_fetch({ ok: true, gateway_url: "", has_session: false });
    render(<App />);

    // The modal is the first screen when disconnected.
    const dialog = await screen.findByRole("dialog", { name: "Gateway connection" });
    expect(dialog).toBeTruthy();

    // Dismiss via the modal's Close button — the modal must not fight the
    // operator (auto-open is once per signed-out episode).
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Gateway connection" })).toBeNull(), { timeout: 3000 });
    // Still closed after state settles (no reopen loop).
    expect(screen.queryByRole("dialog", { name: "Gateway connection" })).toBeNull();
  });

  it("does not auto-open over a live session", async () => {
    stub_fetch({
      ok: true,
      gateway_url: "http://127.0.0.1:8080",
      has_session: true,
      gateway: { ok: true, principal: { user_id: "admin" } },
    });
    render(<App />);

    // The pill reflects the connected phase once the boot probe lands.
    await screen.findByText(/admin|Disconnect|Connected/i, undefined, { timeout: 3000 });
    expect(screen.queryByRole("dialog", { name: "Gateway connection" })).toBeNull();
  });
});
