// @vitest-environment jsdom
//
// Shell pins: the connect modal is the FIRST thing a disconnected operator
// sees (maintainer ruling 2026-07-12) — auto-opened when the session
// status resolves signed-out, dismissible without a reopen loop, and never
// auto-opened over a live session. Since the unified top-bar adoption
// (uic c1648) that behavior lives in the kit's useGatewayConnection hook,
// which probes /api/connection/gateway itself — the tests stub the ROUTE,
// not a module binding.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// About (shared kit dialog): the top-bar About action opens the framework
// About with this build's version, the framework/author facts, the five
// links from the AbstractFramework descriptor, and the versions the gateway
// reports — or one visible "unavailable" row when it cannot say.
describe("App shell About dialog", () => {
  const pkg_version = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")).version as string;

  function stub_about_fetch(about: { status: number; body: any }): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      if (url.includes("/api/connection/gateway")) {
        return new Response(
          JSON.stringify({ ok: true, gateway_url: "http://127.0.0.1:8080", has_session: true, gateway: { ok: true, principal: { user_id: "admin" } } }),
          { status: 200 }
        );
      }
      if (url.includes("/api/gateway/about")) {
        return new Response(typeof about.body === "string" ? about.body : JSON.stringify(about.body), { status: about.status });
      }
      return new Response(JSON.stringify({ ok: true, runs: [], items: [], requests: [], processes: [], entities: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  function rows_of(dialog: HTMLElement): Array<[string, string]> {
    return Array.from(dialog.querySelectorAll(".af-about__row")).map((row) => [
      row.querySelector("dt")?.textContent || "",
      row.querySelector("dd")?.textContent || "",
    ]);
  }

  async function open_about(): Promise<HTMLElement> {
    const button = await screen.findByRole("button", { name: "About AbstractContinuum" });
    fireEvent.click(button);
    return await screen.findByRole("dialog", { name: "About AbstractContinuum" });
  }

  it("shows the app version, framework facts, five links and the gateway versions fetched on open", async () => {
    expect(pkg_version).toMatch(/^\d+\.\d+\.\d+/);
    const fetch_fn = stub_about_fetch({
      status: 200,
      body: { abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: { abstractgateway: "0.4.3", abstractcore: "2.15.2", abstractruntime: "0.4.33" } },
    });
    render(<App />);
    await screen.findByRole("button", { name: "About AbstractContinuum" });
    // Lazy: nothing asks the gateway for versions before the dialog opens.
    expect(fetch_fn.mock.calls.some((c: any[]) => String(c[0]).includes("/api/gateway/about"))).toBe(false);

    const dialog = await open_about();
    await waitFor(() => expect(rows_of(dialog).some(([l]) => l === "Gateway framework")).toBe(true));
    const rows = rows_of(dialog);
    const get = (label: string) => rows.find(([l]) => l === label)?.[1];

    expect(get("Application")).toBe(`AbstractContinuum ${pkg_version}`);
    expect(get("Part of")).toBe("AbstractFramework — https://abstractframework.ai");
    expect(get("Author")).toBe("Laurent-Philippe Albou, PhD (2023-2026)");
    expect(get("Copyright")).toBe("© 2023-2026 Laurent-Philippe Albou, PhD. Released under the MIT License.");

    // The five links, from the descriptor's apps.abstractcontinuum entry.
    const expected_links: Array<[string, string]> = [
      ["Website", "https://abstractframework.ai"],
      ["Source", "https://github.com/lpalbou/AbstractContinuum"],
      ["Documentation", "https://github.com/lpalbou/AbstractContinuum/tree/main/docs"],
      ["Report an issue", "https://github.com/lpalbou/AbstractContinuum/issues"],
      ["Give feedback", "https://github.com/lpalbou/AbstractContinuum/issues/new?labels=feedback"],
    ];
    for (const [label, href] of expected_links) {
      expect(get(label)).toBe(href);
      const row = Array.from(dialog.querySelectorAll(".af-about__row")).find((r) => r.querySelector("dt")?.textContent === label)!;
      const a = row.querySelector("a")!;
      expect(a.getAttribute("href")).toBe(href);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }

    // Gateway rows, after the standard ones.
    expect(get("Gateway")).toBe("AbstractGateway 0.4.3");
    expect(get("Gateway framework")).toBe("AbstractFramework 0.3.3");
    expect(get("Gateway package abstractcore")).toBe("2.15.2");
    expect(get("Gateway package abstractruntime")).toBe("0.4.33");
    expect(rows.filter(([l]) => l === "Gateway package abstractgateway")).toHaveLength(0);
    expect(rows.findIndex(([l]) => l === "Gateway")).toBeGreaterThan(rows.findIndex(([l]) => l === "Give feedback"));
    expect(fetch_fn.mock.calls.some((c: any[]) => String(c[0]).includes("/api/gateway/about"))).toBe(true);

    // Close dismisses.
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).find((b) => dialog.contains(b))!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "About AbstractContinuum" })).toBeNull());
  });

  it("shows one visible 'Gateway: unavailable' row when the gateway cannot answer", async () => {
    stub_about_fetch({ status: 404, body: { detail: "Not Found" } });
    render(<App />);
    const dialog = await open_about();
    await waitFor(() => expect(rows_of(dialog).find(([l]) => l === "Gateway")?.[1]).toMatch(/^unavailable/));
    const gateway_rows = rows_of(dialog).filter(([l]) => l.startsWith("Gateway"));
    expect(gateway_rows).toEqual([["Gateway", "unavailable (HTTP 404: Not Found)"]]);
    // The app facts are still there.
    expect(rows_of(dialog).find(([l]) => l === "Application")?.[1]).toBe(`AbstractContinuum ${pkg_version}`);
  });
});
