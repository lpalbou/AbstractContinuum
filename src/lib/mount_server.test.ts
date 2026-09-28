// Continuum under the gateway's /apps/continuum/ (the
// @abstractframework/app-server mount contract), with the real server
// (bin/server.js) on an ephemeral loopback port, the gateway simulated by
// the X-Forwarded-* headers it sends, and a fake agora hub for the relay.
//
// Proves: the identity header on every response (the WebSocket 101 too);
// the page's <base href> + base_path with a CSP that admits exactly that
// inline script; a malformed forwarded header is refused; the hub proxy,
// its WebSocket relay and the Settings route judge the BROWSER's forwarded
// address (never the gateway's loopback socket) and the Origin against the
// host the browser addressed; the session cookies carry the base path; the
// launch flags speak the kit's spellings and the gateway URL follows the
// local gateway pointer. Standalone at `/` keeps working.
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";

// @ts-expect-error plain-JS module without types
import { parseAppFlags } from "@abstractframework/app-server";
// @ts-expect-error plain-JS module without types
import { createContinuumServer } from "../../bin/server.js";
// @ts-expect-error plain-JS module without types
import { createLiveSettings, parse_args, resolve_settings } from "../../bin/settings.js";

const PAGE = '<!doctype html><html><head><title>t</title><script type="module" src="./assets/app.js"></script></head><body></body></html>';
const PREFIX = "/apps/continuum";
const REMOTE = "203.0.113.50";
// A dead port: no test here may reach a real gateway.
const DEAD_GATEWAY = "http://127.0.0.1:9";

let scratch = "";
let base = "";
let server: any;
let hub: WebSocketServer;
const hubFrames: string[] = [];

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "continuum-mount-"));
  const dist = join(scratch, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), PAGE);
  writeFileSync(join(dist, "assets", "app.js"), "console.log('app');");
  hub = new WebSocketServer({ host: "127.0.0.1", port: 0, path: "/ws" });
  await new Promise<void>((ok) => hub.on("listening", () => ok()));
  hub.on("connection", (sock) => sock.on("message", (d) => hubFrames.push(d.toString())));
  const hubUrl = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
  const settings = createLiveSettings({
    flags: { gateway_url: DEAD_GATEWAY, hub_url: hubUrl, hub_token: "seat-key" },
    settingsPath: join(scratch, "settings.json"),
    env: {},
    home: join(scratch, "home"),
  });
  server = createContinuumServer({ settings, distDir: dist });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((ok) => server.close(ok));
  await new Promise((ok) => hub.close(ok));
  rmSync(scratch, { recursive: true, force: true });
});

/** What the gateway's /apps/continuum/ proxy adds for a browser. */
function viaGateway(client: string, host = "127.0.0.1:8080"): Record<string, string> {
  return { "x-forwarded-for": client, "x-forwarded-prefix": PREFIX, "x-forwarded-proto": "http", "x-forwarded-host": host };
}

describe("serving under /apps/continuum/", () => {
  it("standalone: base href '/' and the identity header", async () => {
    const r = await fetch(`${base}/`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get("x-abstractframework-app")).toBe("continuum; mount=1");
    expect(html).toContain('<base href="/">');
    expect(html).toContain('"base_path":""');
    expect(html).toContain(`"gateway_url":"${DEAD_GATEWAY}"`);
  });

  it("mounted: base href under the prefix, and the CSP admits exactly the injected script", async () => {
    const r = await fetch(`${base}/`, { headers: viaGateway(REMOTE) });
    const html = await r.text();
    expect(html).toContain(`<base href="${PREFIX}/">`);
    expect(html).toContain(`"base_path":"${PREFIX}"`);
    const inline = /<base [^>]*><script>([\s\S]*?)<\/script>/.exec(html)![1];
    const hash = createHash("sha256").update(inline, "utf8").digest("base64");
    const csp = r.headers.get("content-security-policy") || "";
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBe(`script-src 'self' 'sha256-${hash}'`); // never 'unsafe-inline'
    expect(csp).toContain("base-uri 'self'");
  });

  it("every response announces the app: assets, the SPA fallback, the API, refusals", async () => {
    for (const path of ["/assets/app.js", "/some/deep/link", "/api/hub/meta", "/api/continuum/settings"]) {
      const r = await fetch(`${base}${path}`, { headers: viaGateway(REMOTE) });
      expect(r.headers.get("x-abstractframework-app"), path).toBe("continuum; mount=1");
    }
  });

  it("refuses a malformed forwarded header (400) instead of guessing", async () => {
    for (const headers of [{ "x-forwarded-prefix": "/apps/../x" }, { "x-forwarded-for": "not-an-ip" }, { "x-forwarded-host": "a b" }]) {
      const r = await fetch(`${base}/`, { headers });
      expect(r.status, JSON.stringify(headers)).toBe(400);
      expect(r.headers.get("x-abstractframework-app")).toBe("continuum; mount=1");
    }
  });
});

describe("app-local privileged routes judge the BROWSER, not the gateway's socket", () => {
  it("hub proxy: a remote browser through the gateway is refused; a local one passes", async () => {
    const remote = await fetch(`${base}/api/hub/meta`, { headers: viaGateway(REMOTE) });
    expect(remote.status).toBe(403);
    expect((await remote.json()).error).toBe("hub_proxy_non_loopback");
    const local = await fetch(`${base}/api/hub/meta`, { headers: viaGateway("127.0.0.1") });
    expect(local.status).toBe(200);
    expect((await local.json()).seat_key_present).toBe(true);
    const standalone = await fetch(`${base}/api/hub/meta`);
    expect(standalone.status).toBe(200);
  });

  it("hub proxy: the Origin must name the host the browser addressed (the forwarded host behind the gateway)", async () => {
    const same = await fetch(`${base}/api/hub/meta`, { headers: { ...viaGateway("127.0.0.1"), origin: "http://127.0.0.1:8080" } });
    expect(same.status).toBe(200);
    const other = await fetch(`${base}/api/hub/meta`, { headers: { ...viaGateway("127.0.0.1"), origin: "http://evil.example" } });
    expect(other.status).toBe(403);
    // The gateway's host, sent straight to the app's port: Host is 127.0.0.1:<port>.
    const noForward = await fetch(`${base}/api/hub/meta`, { headers: { origin: "http://127.0.0.1:8080" } });
    expect(noForward.status).toBe(403);
  });

  it("a browser on this computer that addressed a DNS name is not local (DNS rebinding): hub proxy, Settings and the WebSocket refuse it", async () => {
    const rebound = { ...viaGateway("127.0.0.1", "rebind.example:8080"), origin: "http://rebind.example:8080" };
    const hub = await fetch(`${base}/api/hub/meta`, { headers: rebound });
    expect(hub.status).toBe(403);
    expect((await hub.json()).error).toBe("hub_proxy_non_loopback");
    const settings = await fetch(`${base}/api/continuum/settings`, { headers: rebound });
    expect(settings.status).toBe(403);
    expect((await settings.json()).error).toBe("settings_non_loopback");
    const { origin, ...wsHeaders } = rebound;
    expect((await openWs("/api/hub/ws", wsHeaders, origin)).status).toBe(403);
  });

  it("forwarded headers from a NON-loopback peer are ignored (the app binds loopback; defence in depth)", async () => {
    const { request_gate } = await import("../../bin/request_gate.js" as string);
    const g = request_gate({ socket: { remoteAddress: "192.168.1.9" }, headers: { host: "h:1", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "h:1" } });
    expect(g.loopback).toBe(false);
  });

  it("Settings route: a remote browser through the gateway is refused", async () => {
    const remote = await fetch(`${base}/api/continuum/settings`, { headers: viaGateway(REMOTE) });
    expect(remote.status).toBe(403);
    expect((await remote.json()).error).toBe("settings_non_loopback");
    const local = await fetch(`${base}/api/continuum/settings`, { headers: { ...viaGateway("127.0.0.1"), origin: "http://127.0.0.1:8080" } });
    expect(local.status).toBe(200);
  });
});

/** Open a WebSocket to the app; resolves with the 101's headers or the refusal status. */
function openWs(path: string, headers: Record<string, string>, origin?: string): Promise<{ ok: boolean; status: number; identity: string | undefined; ws?: WebSocket }> {
  return new Promise((ok) => {
    const ws = new WebSocket(`${base.replace("http", "ws")}${path}`, { headers, origin, perMessageDeflate: false });
    ws.on("upgrade", (res) => {
      ws.once("open", () => ok({ ok: true, status: 101, identity: String(res.headers["x-abstractframework-app"] || ""), ws }));
    });
    ws.on("unexpected-response", (_req, res) => ok({ ok: false, status: res.statusCode || 0, identity: undefined }));
    ws.on("error", () => ok({ ok: false, status: 0, identity: undefined }));
  });
}

describe("the Team hub WebSocket relay through the gateway", () => {
  it("a local browser through the gateway reaches the hub; the 101 announces the app", async () => {
    const r = await openWs("/api/hub/ws", viaGateway("127.0.0.1"), "http://127.0.0.1:8080");
    expect(r.ok).toBe(true);
    expect(r.identity).toBe("continuum; mount=1");
    r.ws!.send(JSON.stringify({ type: "subscribe", channels: ["commons"] }));
    await new Promise((d) => setTimeout(d, 200));
    expect(hubFrames).toContain(JSON.stringify({ type: "subscribe", channels: ["commons"] }));
    r.ws!.close();
  });

  it("refuses a remote browser (403), another site's page (403), a malformed header (400), any other path (404)", async () => {
    expect((await openWs("/api/hub/ws", viaGateway(REMOTE), "http://127.0.0.1:8080")).status).toBe(403);
    expect((await openWs("/api/hub/ws", viaGateway("127.0.0.1"), "https://evil.example")).status).toBe(403);
    expect((await openWs("/api/hub/ws", { "x-forwarded-prefix": "/x/../y" })).status).toBe(400);
    expect((await openWs("/elsewhere", viaGateway("127.0.0.1"))).status).toBe(404);
  });
});

describe("session cookies under the base path", () => {
  it("sign-out clears the cookies at Path=/apps/continuum/ (and the legacy /)", async () => {
    const r = await fetch(`${base}/api/connection/gateway`, { method: "DELETE", headers: { ...viaGateway("127.0.0.1"), origin: "http://127.0.0.1:8080", "x-abstract-csrf": "x" } });
    const cookies = r.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("abstractcontinuum_gateway_session=") && c.includes(`Path=${PREFIX}/`))).toBe(true);
  });
});

describe("launch flags and the gateway URL", () => {
  it("speaks the kit's spellings: --gateway-url, --gateway, --url, --port, --host (both forms)", () => {
    const home = join(scratch, "flags-home");
    for (const argv of [
      ["--gateway-url", "http://gw:1", "--port", "4100", "--host", "127.0.0.1"],
      ["--gateway=http://gw:1", "--port=4100", "--host=127.0.0.1"],
      ["--url", "http://gw:1", "--port", "4100", "--host", "127.0.0.1"],
    ]) {
      const kit = parseAppFlags(argv, { defaultPort: 3002, envPrefix: "ABSTRACTCONTINUUM", env: {}, home });
      const ours = parse_args(argv);
      expect(ours.error, argv.join(" ")).toBe("");
      expect({ gateway: ours.flags.gateway_url, port: ours.flags.port, host: ours.flags.host }).toEqual({ gateway: kit.gatewayUrl, port: kit.port, host: kit.host });
    }
  });

  it("nothing chosen: the local gateway pointer, reported as such; a flag, a setting, the environment still win", () => {
    const home = join(scratch, "pointer-home");
    mkdirSync(join(home, ".abstractframework"), { recursive: true });
    writeFileSync(join(home, ".abstractframework", "gateway.json"), JSON.stringify({ schema: 1, url: "http://127.0.0.1:18899", port: 18899 }));
    expect(resolve_settings({ home }).settings.gateway_url).toEqual({ value: "http://127.0.0.1:18899", source: "pointer" });
    expect(resolve_settings({ home, env: { ABSTRACTGATEWAY_URL: "http://env:1" } }).settings.gateway_url.source).toBe("env");
    expect(resolve_settings({ home, file: { gateway_url: "http://saved:1" } }).settings.gateway_url.source).toBe("setting");
    expect(resolve_settings({ home, flags: { gateway_url: "http://flag:1" } }).settings.gateway_url.source).toBe("flag");
    expect(resolve_settings({ home: join(scratch, "empty-home") }).settings.gateway_url).toEqual({ value: "http://127.0.0.1:8080", source: "default" });
  });
});
