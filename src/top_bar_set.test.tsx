// @vitest-environment jsdom
//
// The shared top-bar set (operator ruling 2026-10-29: "change the widget once,
// it changes everywhere"): the docs drawer button, the theme picker
// (Appearance), the About dialog and the account widget are the KIT's
// components (AfTopBarActions), in the kit's order. Signed in, the account is
// ONE button (person icon, name, connection light) whose menu holds Signed in
// as / Gateway / Copy user id / Disconnect, with no pill beside it. Removing a
// piece (or the identity) from app.tsx turns this red.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      if (url.includes("api/connection/gateway")) {
        return new Response(
          JSON.stringify({ ok: true, gateway_url: "http://127.0.0.1:8080", has_session: true, gateway: { ok: true, principal: { user_id: "alice", tenant_id: "default" } } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, runs: [], items: [], requests: [], processes: [], entities: [] }), { status: 200 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the shared top-bar set", () => {
  it("renders the kit's docs, appearance, About and ONE account widget, in the kit's order", async () => {
    render(<App />);
    const account = await screen.findByRole("button", { name: /^Account: Signed in as alice · gateway 127\.0\.0\.1:8080/ }, { timeout: 3000 });
    const bar = account.closest('[role="group"][aria-label="App actions"]') as HTMLElement;
    expect(bar).toBeTruthy();

    const docs = within(bar).getByRole("button", { name: "Docs assistant" });
    const appearance = within(bar).getByRole("button", { name: "Appearance (theme and typography)" });
    const about = within(bar).getByRole("button", { name: "About AbstractContinuum" });
    const order = Array.from(bar.querySelectorAll("button")).filter((b) => [docs, appearance, about, account].includes(b));
    expect(order).toEqual([docs, appearance, about, account]);

    // ONE account widget: the person, the name and the light in one button; no pill beside it.
    expect(account.querySelector("svg")).toBeTruthy();
    expect(account.querySelector(".af-topbar__identity-label")?.textContent).toBe("alice");
    expect(account.querySelector(".af-topbar__dot--connected")).toBeTruthy();
    expect(bar.querySelector(".af-topbar__pill")).toBeNull();

    fireEvent.click(account);
    const menu = await screen.findByRole("menu");
    expect(menu.textContent).toContain("Signed in as alice");
    expect(menu.textContent).toContain("Gateway 127.0.0.1:8080");
    expect(within(menu).getByRole("menuitem", { name: "Disconnect" })).toBeTruthy();
  });

  it("opens the kit's Appearance dialog and toggles the kit docs drawer", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /^Account: Signed in as alice/ }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Appearance (theme and typography)" }));
    const dialog = await screen.findByRole("dialog", { name: "Appearance" });
    expect(dialog.classList.contains("af-appearance")).toBe(true);

    const docs = screen.getByRole("button", { name: "Docs assistant" });
    expect(docs.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(docs);
    await waitFor(() => expect(docs.getAttribute("aria-pressed")).toBe("true"));
  });
});
