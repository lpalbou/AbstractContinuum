// @vitest-environment jsdom
//
// QA (11) 2026-10-28: on a fresh install (no hub seat key) Continuum showed two raw 503s
// (hub_seat_unavailable from bin/hub_proxy.js) because the Board fired its hub calls without
// reading `api/hub/meta` first. The page reads meta first and, unconfigured, says why and how to
// configure it, firing no hub route.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHubProxy } from "../../../bin/hub_proxy.js";
import { hub_not_configured } from "../../lib/hub_client";
import { use_work_claims } from "./use_work_claims";

const SETUP = 'No hub key for seat "operator" in /home/x/keys.json. Provision the seat there, or start Continuum with --hub-token-file <path>.';

function stub_fetch(meta: Record<string, unknown>) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).endsWith("api/hub/meta")) return new Response(JSON.stringify(meta), { status: 200 });
      return new Response(JSON.stringify({ error: "hub_seat_unavailable", detail: "No hub key" }), { status: 503 });
    }),
  );
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the hub not configured (no seat key)", () => {
  it("the Board's live claims read meta first, fire no hub route and say how to configure it", async () => {
    const urls = stub_fetch({ ok: true, hub_url: "http://127.0.0.1:8787", seat: "operator", seat_key_present: false, setup: SETUP });
    const { result } = renderHook(() => use_work_claims(true));
    await waitFor(() => expect(result.current.not_configured).toBeTruthy());
    expect(result.current.not_configured).toBe(`The team hub is not configured. ${SETUP}`);
    expect(urls.filter((u) => !u.endsWith("api/hub/meta"))).toEqual([]);
  });

  it("configured: the claims are read (meta, then the hub routes)", async () => {
    const urls = stub_fetch({ ok: true, hub_url: "http://127.0.0.1:8787", seat: "operator", seat_key_present: true });
    renderHook(() => use_work_claims(true));
    await waitFor(() => expect(urls.some((u) => !u.endsWith("api/hub/meta"))).toBe(true));
    expect(urls[0]).toMatch(/api\/hub\/meta$/);
  });

  it("the sentence: empty when the key is present; the proxy's setup sentence otherwise", () => {
    expect(hub_not_configured({ seat: "operator", seat_key_present: true })).toBe("");
    expect(hub_not_configured({ seat: "operator", seat_key_present: false, setup: SETUP })).toBe(`The team hub is not configured. ${SETUP}`);
    expect(hub_not_configured({ seat: "s1", seat_key_present: false })).toMatch(/not configured.*seat "s1".*--hub-token-file/);
  });

  it("the proxy's meta names the setup when no key is found, and none when one is", async () => {
    const meta = async (token?: string) => {
      const proxy = createHubProxy({ hubUrl: "http://127.0.0.1:1", seat: "test-seat", keysPath: "/nonexistent/keys.json", ...(token ? { token } : {}) });
      return await new Promise<any>((resolve) => {
        const req: any = { method: "GET", url: "/api/hub/meta", headers: { host: "127.0.0.1:3002" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() {} };
        const res: any = { writeHead() {}, end: (b: string) => resolve(JSON.parse(String(b))) };
        proxy.handle(req, res, "/api/hub/meta", "");
      });
    };
    const without = await meta();
    expect(without.seat_key_present).toBe(false);
    expect(without.setup).toMatch(/No hub key for seat "test-seat" in \/nonexistent\/keys\.json.*--hub-token-file/);
    const withKey = await meta("test-key");
    expect(withKey.seat_key_present).toBe(true);
    expect(withKey.setup).toBeUndefined();
  });
});

describe("a card's hub activity with the hub not configured", () => {
  it("reads meta only and shows the sentence", async () => {
    const { render, waitFor: wait } = await import("@testing-library/react");
    const React = await import("react");
    const { WorkActivityPanel } = await import("./work_activity_panel");
    const urls = stub_fetch({ ok: true, hub_url: "http://127.0.0.1:8787", seat: "operator", seat_key_present: false, setup: SETUP });
    const card: any = { key: "file:x", work_id: "abstractcontinuum-0042", title: "x", column: "ready" };
    render(React.createElement(WorkActivityPanel, { card, on_close: () => {} }));
    await wait(() => expect(document.querySelector('[data-hub-note="not-configured"]')?.textContent || "").toContain("The team hub is not configured."));
    expect(urls.filter((u) => !u.endsWith("api/hub/meta"))).toEqual([]);
  });
});
