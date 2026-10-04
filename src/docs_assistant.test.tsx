// @vitest-environment jsdom
//
// Round 8 (R8.3): Continuum's Docs assistant is the kit's shared
// DocsAssistantDrawer (panel-chat), opened from the top bar's `docs` slot,
// grounded on THIS app's llms.txt (served from this app's build, read by the
// gateway at docs/corpus?app=continuum) through the docs-qa workflow. The
// advisor (the app's own agent) stays on the `assistant` slot.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";
// @ts-expect-error plain-JS module without types
import { createContinuumServer } from "../bin/server.js";
// @ts-expect-error plain-JS module without types
import { createLiveSettings } from "../bin/settings.js";

const enc = new TextEncoder();
const ANSWER = "Open **Backlog** and press New task.\n\n```json\n{\"page\": \"backlog\"}\n```";

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.cookie = "abstractcontinuum_gateway_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

/** A fake gateway behind `fetch`: a live session, the corpus, docs-qa run
 *  start, live llm.delta frames, then the completed run on the second poll. */
function fakeGateway() {
  const calls: { url: string; method: string; csrf: string | null; body?: any }[] = [];
  let polls = 0;
  let releaseStream: () => void = () => {};
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const delta = (seq: number, text: string) =>
    `event: llm.delta\ndata: ${JSON.stringify({ kind: "llm.delta", run_id: "docs-run", call_id: "c1", seq, text, channel: "content", snapshot: false })}\n\n`;
  const streamGate = new Promise<void>((r) => (releaseStream = r));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: RequestInit = {}) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      const headers = new Headers(init.headers || {});
      calls.push({ url, method: String(init.method || "GET"), csrf: headers.get("x-abstractcontinuum-csrf"), body: init.body });
      if (url.includes("api/connection/gateway")) return json({ ok: true, gateway_url: "http://127.0.0.1:8080", has_session: true, gateway: { ok: true, principal: { user_id: "admin" } } });
      if (url.endsWith("api/gateway/docs/corpus?app=continuum")) return json({ app: "AbstractContinuum", text: "# AbstractContinuum\n\n## Backlog\nPress New task." });
      if (url.endsWith("api/gateway/runs/start")) return json({ run_id: "docs-run" });
      if (url.endsWith("api/gateway/runs/docs-run/ledger/stream?after=0"))
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(enc.encode(delta(0, "Open ")));
              c.enqueue(enc.encode(delta(1, "**Backlog**")));
              // Close after the poll completes, so the live text is observable first.
              void streamGate.then(() => c.close());
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      if (url.endsWith("api/gateway/runs/docs-run")) {
        polls += 1;
        return json({ status: polls >= 3 ? "completed" : "running", output: polls >= 3 ? { response: ANSWER } : null });
      }
      return json({ ok: true, runs: [], items: [], requests: [], processes: [], entities: [] });
    })
  );
  return { calls, releaseStream: () => releaseStream() };
}

describe("Continuum Docs assistant (kit DocsAssistantDrawer)", () => {
  it("opens from the docs slot, streams the docs-qa reply, then shows the final answer", async () => {
    document.cookie = "abstractcontinuum_gateway_csrf=csrf%2Dtoken";
    const gw = fakeGateway();
    render(<App />);

    const docsBtn = await screen.findByRole("button", { name: "Docs assistant" });
    expect(docsBtn.className).toContain("af-topbar__btn--docs");
    // The advisor keeps its own button.
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeTruthy();
    fireEvent.click(docsBtn);
    const drawer = document.querySelector(".continuum-docs-assistant") as HTMLElement;
    expect(drawer).toBeTruthy();
    const d = within(drawer);
    // Compact header: icon-only New conversation + close; one-line grounding footer.
    const newBtn = d.getByRole("button", { name: "New conversation" });
    expect(newBtn.textContent).toBe("");
    expect(newBtn.querySelector("svg")).toBeTruthy();
    expect(d.getByRole("button", { name: "Close panel" })).toBeTruthy();
    expect(drawer.querySelector(".pc-docs-assistant__footer")?.textContent).toBe("Grounded on AbstractContinuum’s documentation (llms.txt) · docs-qa");

    const box = d.getByRole("textbox", { name: "Question about AbstractContinuum" });
    await waitFor(() => expect((box as HTMLTextAreaElement).disabled).toBe(false), { timeout: 3000 });
    fireEvent.change(box, { target: { value: "How do I add a task?" } });
    fireEvent.click(d.getByRole("button", { name: "Send" }));

    // Streamed first (live bubble), from the llm.delta frames.
    await waitFor(() => expect(drawer.querySelector(".pc-chat-item--live")?.textContent).toContain("Open Backlog"), { timeout: 4000 });
    gw.releaseStream();
    // Then the completed run's answer replaces it: markdown + JSON rendered.
    await waitFor(() => expect(drawer.querySelector(".pc-chat-item--live")).toBeNull(), { timeout: 6000 });
    const reply = drawer.querySelector(".pc-chat-item--assistant") as HTMLElement;
    expect(reply.querySelector("strong")?.textContent).toBe("Backlog");
    expect(reply.textContent).toContain("backlog");
    // Question on the right (user card), answer on the left.
    expect(drawer.querySelector(".pc-chat-item--user")?.textContent).toContain("How do I add a task?");

    const start = gw.calls.find((c) => c.url.endsWith("api/gateway/runs/start"))!;
    const body = JSON.parse(String(start.body));
    expect(body).toMatchObject({ bundle_id: "docs-qa", flow_id: "docsqa001" });
    expect(body.input_data).toMatchObject({ prompt: "How do I add a task?", app: "AbstractContinuum", use_session_history: true });
    expect(body.input_data.docs).toContain("Press New task.");
    expect(start.csrf).toBe("csrf-token");

    // Opening the advisor closes the docs drawer (one right drawer at a time).
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    await waitFor(() => expect(drawer.style.display).toBe("none"));
  }, 15000);
});

describe("the app serves its llms.txt (what the gateway reads)", () => {
  it("GET /llms.txt answers text/plain from dist, not the SPA shell", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "continuum-llms-"));
    const dist = join(scratch, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>AbstractContinuum</title>");
    writeFileSync(join(dist, "llms.txt"), "# AbstractContinuum\n");
    const settings = createLiveSettings({ flags: { gateway_url: "http://127.0.0.1:9" }, settingsPath: join(scratch, "settings.json"), env: {}, home: join(scratch, "home") });
    const server = createContinuumServer({ settings, distDir: dist });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/llms.txt`, (r) => {
            let body = "";
            r.on("data", (c) => (body += c));
            r.on("end", () => resolve({ status: r.statusCode || 0, type: String(r.headers["content-type"] || ""), body }));
          })
          .on("error", reject);
      });
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/^text\/plain/);
      expect(res.body).toBe("# AbstractContinuum\n");
    } finally {
      await new Promise((ok) => server.close(ok));
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
