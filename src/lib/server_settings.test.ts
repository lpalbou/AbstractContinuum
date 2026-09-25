// Continuum server settings (bin/settings.js): one precedence rule —
// launch flag > settings file > environment (legacy) > default — for
// every key, the `config` subcommand, --hub-token-file, the Settings
// page's server route, and the bridge to the session proxy's gates.
import { spawn, spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain-JS module without types
import { SETTINGS, apply_session_proxy_gates, createLiveSettings, createSettingsRoute, parse_args, resolve_settings } from "../../bin/settings.js";

const root = resolve(__dirname, "..", "..");
const CLI = resolve(root, "bin/cli.js");

const dirs: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "continuum-settings-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** An environment with no Continuum/legacy names, so the operator's own
 *  shell can never leak into a result. */
function clean_env(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  const legacy = new Set<string>(SETTINGS.flatMap((s: any) => s.env));
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !legacy.has(k)) env[k] = v;
  return { ...env, ...extra };
}

/** Three distinct valid values per type: [flag, file, env]. */
function samples(spec: any): [unknown, unknown, string] {
  switch (spec.type) {
    case "port":
      return [4101, 4102, "4103"];
    case "bool":
      // default is off: flag says off, file says on, env says on — so each
      // rung is distinguishable from the one below it.
      return [false, true, "1"];
    case "url":
      return ["http://flag.test:1", "http://file.test:2", "http://env.test:3"];
    case "seat":
      return ["flagseat", "fileseat", "envseat"];
    default:
      return ["flag-value", "file-value", "env-value"];
  }
}

describe("precedence: flag > settings file > environment (legacy) > default", () => {
  for (const spec of SETTINGS as any[]) {
    it(`resolves ${spec.key}`, () => {
      const [f, file, env] = samples(spec);
      const envs = Object.fromEntries(spec.env.map((n: string) => [n, env]));
      const all = resolve_settings({ flags: { [spec.key]: f }, file: { [spec.key]: file }, env: envs }).settings[spec.key];
      expect(all).toEqual({ value: f, source: "flag" });

      const no_flag = resolve_settings({ file: { [spec.key]: file }, env: envs }).settings[spec.key];
      expect(no_flag).toEqual({ value: file, source: "setting" });

      const env_only = resolve_settings({ env: envs }).settings[spec.key];
      expect(env_only.source).toBe("env");
      expect(env_only.value).toEqual(spec.type === "port" ? 4103 : spec.type === "bool" ? true : env);

      const none = resolve_settings({}).settings[spec.key];
      expect(none).toEqual({ value: spec.default, source: "default" });
    });
  }

  it("reads every legacy name, the app-specific one first", () => {
    const r = resolve_settings({ env: { ABSTRACTGATEWAY_URL: "http://shared:1" } }).settings;
    expect(r.gateway_url).toEqual({ value: "http://shared:1", source: "env" });
    const both = resolve_settings({ env: { ABSTRACTGATEWAY_URL: "http://shared:1", ABSTRACTCONTINUUM_GATEWAY_URL: "http://app:2" } }).settings;
    expect(both.gateway_url.value).toBe("http://app:2");
  });

  it("skips an invalid saved value and says so", () => {
    const r = resolve_settings({ file: { port: "abc" }, env: { PORT: "4200" } });
    expect(r.settings.port).toEqual({ value: 4200, source: "env" });
    expect(r.problems.join("\n")).toMatch(/port/);
  });
});

describe("launch flags", () => {
  it("parses value flags, both spellings, and on/off forms", () => {
    const p = parse_args(["--port", "4001", "--hub-seat=laurent", "--hub-allow-remote", "--no-trust-proxy-headers", "--allow-gateway-url-cookie=off"]);
    expect(p.error).toBe("");
    expect(p.flags).toEqual({ port: 4001, hub_seat: "laurent", hub_allow_remote: true, trust_proxy_headers: false, allow_gateway_url_cookie: false });
  });

  it("refuses unknown options and bad values", () => {
    expect(parse_args(["--bogus"]).error).toMatch(/unknown option --bogus/);
    expect(parse_args(["--port", "x"]).error).toMatch(/port/);
    expect(parse_args(["--hub-seat"]).error).toMatch(/needs a value/);
  });

  it("--hub-token-file reads the token from a file", () => {
    const d = scratch();
    writeFileSync(join(d, "token"), "  tok-from-file\n");
    expect(parse_args(["--hub-token-file", join(d, "token")]).flags.hub_token).toBe("tok-from-file");
    expect(parse_args(["--hub-token-file", join(d, "missing")]).error).toMatch(/cannot read/);
    writeFileSync(join(d, "empty"), "\n");
    expect(parse_args(["--hub-token-file", join(d, "empty")]).error).toMatch(/empty/);
  });
});

function cli(args: string[], env = clean_env()) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf-8", env });
}

describe("abstractcontinuum config", () => {
  it("set / get / unset round-trip through an owner-only settings file", () => {
    const f = join(scratch(), "home", "settings.json");
    expect(cli(["config", "set", "hub_seat", "laurent", "--settings-file", f]).status).toBe(0);
    expect(JSON.parse(readFileSync(f, "utf-8"))).toEqual({ hub_seat: "laurent" });
    expect(statSync(f).mode & 0o777).toBe(0o600);

    const got = cli(["config", "get", "hub_seat", "--settings-file", f]);
    expect(got.stdout.trim()).toBe("laurent");
    const all = cli(["config", "get", "--settings-file", f], clean_env({ ABSTRACTCONTINUUM_HUB_SEAT: "legacy" }));
    expect(all.stdout).toMatch(/hub_seat\s+laurent\s+\(setting\)/);

    expect(cli(["config", "unset", "hub_seat", "--settings-file", f]).status).toBe(0);
    expect(JSON.parse(readFileSync(f, "utf-8"))).toEqual({});
    const legacy = cli(["config", "get", "--settings-file", f], clean_env({ ABSTRACTCONTINUUM_HUB_SEAT: "legacy" }));
    expect(legacy.stdout).toMatch(/hub_seat\s+legacy\s+\(environment \(legacy\)\)/);
    expect(cli(["config", "get", "hub_seat", "--settings-file", f]).stdout.trim()).toBe("operator");
  });

  it("stores the hub token from a file and never prints it", () => {
    const d = scratch();
    const f = join(d, "settings.json");
    writeFileSync(join(d, "token"), "sekret-token-42\n");
    const set = cli(["config", "set", "hub_token", "--from-file", join(d, "token"), "--settings-file", f]);
    expect(set.status).toBe(0);
    expect(JSON.parse(readFileSync(f, "utf-8")).hub_token).toBe("sekret-token-42");
    expect(statSync(f).mode & 0o777).toBe(0o600);
    const out = set.stdout + set.stderr + cli(["config", "get", "--settings-file", f]).stdout + cli(["config", "get", "hub_token", "--settings-file", f]).stdout;
    expect(out).toContain("(set, hidden)");
    expect(out).not.toContain("sekret-token-42");
  });

  it("refuses unknown keys and invalid values", () => {
    const f = join(scratch(), "settings.json");
    expect(cli(["config", "set", "nope", "1", "--settings-file", f]).status).toBe(2);
    const bad = cli(["config", "set", "port", "abc", "--settings-file", f]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/port/);
  });
});

/** Start the real server on a free-ish port; resolve once it prints its
 *  banner; always killed by the caller. */
async function start_server(args: string[], env = clean_env()) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [CLI, "--port", String(port), "--hub-url", "http://127.0.0.1:1", ...args], { env });
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`server did not start: ${log}`)), 8000);
    child.stdout.on("data", () => {
      if (log.includes("is running")) {
        clearTimeout(t);
        ok();
      }
    });
    child.on("exit", () => {
      clearTimeout(t);
      fail(new Error(`server exited: ${log}`));
    });
  });
  return { port, child, log: () => log };
}

describe("the server", () => {
  it("takes the seat from the flag over the file over the environment, and never logs the token", async () => {
    const d = scratch();
    const f = join(d, "settings.json");
    writeFileSync(f, JSON.stringify({ hub_seat: "fileseat" }));
    writeFileSync(join(d, "token"), "sekret-token-99\n");
    const s = await start_server(["--settings-file", f, "--hub-token-file", join(d, "token"), "--hub-seat", "flagseat"], clean_env({ ABSTRACTCONTINUUM_HUB_SEAT: "envseat" }));
    try {
      const meta = await (await fetch(`http://127.0.0.1:${s.port}/api/hub/meta`)).json();
      expect(meta).toMatchObject({ seat: "flagseat", seat_key_present: true });
      const view = await (await fetch(`http://127.0.0.1:${s.port}/api/continuum/settings`)).json();
      expect(view.settings.hub_seat).toEqual({ value: "flagseat", source: "flag" });
      expect(view.settings.hub_token).toEqual({ set: true, source: "flag" });
      expect(JSON.stringify(view)).not.toContain("sekret-token-99");
      expect(s.log()).toMatch(/Hub seat: flagseat \(launch flag\)/);
      expect(s.log()).not.toContain("sekret-token-99");
    } finally {
      s.child.kill();
    }
  });

  it("uses the saved seat over the environment and applies a Settings save at once", async () => {
    const f = join(scratch(), "settings.json");
    writeFileSync(f, JSON.stringify({ hub_seat: "fileseat" }));
    const s = await start_server(["--settings-file", f], clean_env({ ABSTRACTCONTINUUM_HUB_SEAT: "envseat", ABSTRACTCONTINUUM_HUB_KEY: "k" }));
    try {
      const base = `http://127.0.0.1:${s.port}`;
      expect((await (await fetch(`${base}/api/hub/meta`)).json()).seat).toBe("fileseat");
      const put = await fetch(`${base}/api/continuum/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_seat: "laurent" }),
      });
      expect(put.status).toBe(200);
      expect((await put.json()).settings.hub_seat).toEqual({ value: "laurent", source: "setting" });
      expect(JSON.parse(readFileSync(f, "utf-8")).hub_seat).toBe("laurent");
      expect((await (await fetch(`${base}/api/hub/meta`)).json()).seat).toBe("laurent");
    } finally {
      s.child.kill();
    }
  });

  it("refuses to start on a corrupt settings file", () => {
    const f = join(scratch(), "settings.json");
    writeFileSync(f, "{not json");
    const r = cli(["--settings-file", f, "--port", "1"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/cannot read the settings file/);
  });
});

/** Minimal req/res doubles for the route. */
function call_route(route: any, method: string, opts: { body?: unknown; headers?: Record<string, string>; peer?: string } = {}) {
  const chunks = opts.body === undefined ? [] : [Buffer.from(JSON.stringify(opts.body))];
  const req: any = {
    method,
    url: "/api/continuum/settings",
    headers: { host: "127.0.0.1:3002", ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) },
    socket: { remoteAddress: opts.peer ?? "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
  return new Promise<{ status: number; body: any }>((ok) => {
    let status = 0;
    const res: any = {
      writeHead: (code: number) => (status = code),
      end: (b: string) => ok({ status, body: JSON.parse(b) }),
    };
    expect(route.handle(req, res, "/api/continuum/settings")).toBe(true);
  });
}

describe("settings route (Settings page → settings file)", () => {
  function setup(flags: Record<string, unknown> = {}) {
    const f = join(scratch(), "settings.json");
    const live = createLiveSettings({ flags, settingsPath: f, env: {} });
    return { f, live, route: createSettingsRoute({ live }) };
  }

  it("persists the hub seat so a restart reads it", async () => {
    const { f, route } = setup();
    const r = await call_route(route, "PUT", { body: { hub_seat: "laurent" } });
    expect(r.status).toBe(200);
    expect(r.body.settings.hub_seat).toEqual({ value: "laurent", source: "setting" });
    // A fresh process (new live settings on the same file) sees it.
    const again = createLiveSettings({ flags: {}, settingsPath: f, env: {} });
    expect(again.get().hub_seat).toEqual({ value: "laurent", source: "setting" });
    const cleared = await call_route(route, "PUT", { body: { hub_seat: null } });
    expect(cleared.body.settings.hub_seat).toEqual({ value: "operator", source: "default" });
    expect(JSON.parse(readFileSync(f, "utf-8"))).toEqual({});
  });

  it("saves under a launch flag but reports the flag as the winner", async () => {
    const { f, route } = setup({ hub_seat: "flagseat" });
    const r = await call_route(route, "PUT", { body: { hub_seat: "laurent" } });
    expect(r.body.settings.hub_seat).toEqual({ value: "flagseat", source: "flag" });
    expect(JSON.parse(readFileSync(f, "utf-8")).hub_seat).toBe("laurent");
  });

  it("refuses other machines, other origins, other keys, and bad seats", async () => {
    const { route } = setup();
    expect((await call_route(route, "GET", { peer: "10.0.0.5" })).status).toBe(403);
    expect((await call_route(route, "PUT", { body: { hub_seat: "x" }, headers: { origin: "http://evil.test" } })).status).toBe(403);
    expect((await call_route(route, "PUT", { body: { port: 1 } })).status).toBe(400);
    expect((await call_route(route, "PUT", { body: { hub_seat: "a b/../c" } })).status).toBe(400);
    const text = await call_route(route, "PUT", { body: { hub_seat: "x" }, headers: { "content-type": "text/plain" } });
    expect(text.status).toBe(415);
  });
});

describe("session proxy gates", () => {
  it("hands the proxy only the resolved value — a legacy variable cannot beat an explicit flag", () => {
    const env: Record<string, string> = { ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS: "1", ABSTRACTGATEWAY_TRUST_PROXY_HEADERS: "1" };
    const off = resolve_settings({ flags: { trust_proxy_headers: false }, env }).settings;
    apply_session_proxy_gates(off, env);
    expect(env).toEqual({});

    const env2: Record<string, string> = {};
    const on = resolve_settings({ file: { allow_remote_gateway_config: true } }).settings;
    apply_session_proxy_gates(on, env2);
    expect(env2).toEqual({ ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG: "1" });
  });
});
