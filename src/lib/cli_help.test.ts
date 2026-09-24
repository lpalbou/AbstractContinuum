import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// `abstractcontinuum --help` lists every server variable that
// docs/configuration.md documents, and no default names a real person.
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf-8");

function help(): string {
  const r = spawnSync(process.execPath, [resolve(root, "bin/cli.js"), "--help"], { encoding: "utf-8" });
  expect(r.status).toBe(0);
  return r.stdout;
}

function documented_server_variables(): string[] {
  const doc = read("docs/configuration.md");
  const start = doc.indexOf("## Server");
  const end = doc.indexOf("## Gateway-side features");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const names = new Set<string>();
  for (const m of doc.slice(start, end).matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)) names.add(m[1]);
  return [...names];
}

describe("abstractcontinuum --help", () => {
  it("lists every documented server and Team page variable", () => {
    const text = help();
    const names = documented_server_variables();
    expect(names).toContain("ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE");
    expect(names).toContain("ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS");
    expect(names.filter((n) => !text.includes(n))).toEqual([]);
  });

  it("defaults the hub seat to a neutral name", () => {
    expect(help()).toMatch(/default operator\)/);
    expect(read("bin/cli.js")).toContain("process.env.ABSTRACTCONTINUUM_HUB_SEAT || 'operator'");
    expect(read("vite.config.ts")).toContain('process.env.ABSTRACTCONTINUUM_HUB_SEAT || "operator"');
    expect(read("docs/configuration.md")).toContain("| `ABSTRACTCONTINUUM_HUB_SEAT` | `operator` |");
    for (const f of ["bin/cli.js", "vite.config.ts"]) expect(read(f)).not.toMatch(/HUB_SEAT \|\| ['"]laurent/);
  });
});
