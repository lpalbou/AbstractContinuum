import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// @ts-expect-error plain-JS module without types
import { SETTINGS } from "../../bin/settings.js";

// `abstractcontinuum --help` lists every launch flag with its default and
// its settings-file key, instructs no environment variable, and agrees
// with docs/configuration.md; no default names a real person.
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf-8");

function help(): string {
  const r = spawnSync(process.execPath, [resolve(root, "bin/cli.js"), "--help"], { encoding: "utf-8" });
  expect(r.status).toBe(0);
  return r.stdout;
}

function server_section(): string {
  const doc = read("docs/configuration.md");
  const start = doc.indexOf("## Server");
  const end = doc.indexOf("## Gateway-side features");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return doc.slice(start, end);
}

describe("abstractcontinuum --help", () => {
  it("lists every launch flag with its default and settings key", () => {
    const text = help();
    expect(SETTINGS.length).toBeGreaterThanOrEqual(11);
    for (const spec of SETTINGS as any[]) {
      const at = text.indexOf(`  ${spec.flag}`);
      expect(at, spec.flag).toBeGreaterThanOrEqual(0);
      const block = text.slice(at, text.indexOf("\n  --", at + 3));
      const def = spec.type === "bool" ? "off" : spec.default === "" ? "none" : String(spec.default);
      expect(block, spec.flag).toContain(`default ${def}; setting ${spec.key}`);
    }
    for (const extra of ["--hub-token-file <path>", "--settings-file <path>", "config set <setting> <value>", "config unset <setting>", "config get"]) {
      expect(text).toContain(extra);
    }
  });

  it("instructs no environment variable", () => {
    const text = help();
    const names = new Set<string>((SETTINGS as any[]).flatMap((s) => s.env));
    expect([...names].filter((n) => text.includes(n))).toEqual([]);
    expect(text).toMatch(/^Legacy fallback: /m);
  });

  it("agrees with the configuration guide", () => {
    const doc = server_section();
    const text = help();
    const doc_flags = new Set([...doc.matchAll(/`(--[a-z][a-z-]+)/g)].map((m) => m[1]));
    for (const spec of SETTINGS as any[]) {
      expect(doc_flags.has(spec.flag), spec.flag).toBe(true);
      // The legacy names stay documented (last column) for existing setups.
      for (const n of spec.env) expect(doc, n).toContain(`\`${n}\``);
    }
    // `--no-<flag>` is the generic off form ("--no-option" in --help).
    for (const f of doc_flags) expect(text, f).toContain(f.startsWith("--no-") ? "--no-option" : f);
  });

  it("defaults the hub seat to a neutral name", () => {
    const seat = (SETTINGS as any[]).find((s) => s.key === "hub_seat");
    expect(seat.default).toBe("operator");
    expect(help()).toContain("default operator; setting hub_seat");
    expect(server_section()).toMatch(/\| `--hub-seat <seat>` \| `hub_seat` \| `operator` \|/);
    for (const f of ["bin/cli.js", "bin/settings.js", "vite.config.ts"]) expect(read(f)).not.toMatch(/laurent/i);
  });
});
