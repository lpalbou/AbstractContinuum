// The one build serves at `/` on the app's own port and at
// `/apps/continuum/` behind the gateway: every URL the app builds for its
// own origin is RELATIVE (scripts/check_relative_urls.mjs; `npm run build`
// runs the same check over dist/).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain-JS module without types
import { findRootAbsoluteUrls } from "../../scripts/check_relative_urls.mjs";

const root = resolve(__dirname, "..", "..");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("same-origin URLs are relative", () => {
  it("src/ builds no root-absolute /api/, /assets/, /app/ or /demo/ URL", () => {
    expect(findRootAbsoluteUrls([resolve(root, "src")], root)).toEqual([]);
  });

  it("the check sees every root-absolute spelling (and a missing directory is an error)", () => {
    const d = mkdtempSync(join(tmpdir(), "continuum-urls-"));
    dirs.push(d);
    mkdirSync(join(d, "ui"));
    writeFileSync(join(d, "ui", "a.ts"), 'fetch("/api/hub/meta");\nconst u = `${base}/api/gateway/runs`;\nconst ok = `${apiBase(base)}/api/x`;\nfetch("api/fine");\n');
    writeFileSync(join(d, "index.html"), '<script src="/assets/app.js"></script><a href="//cdn.example/x">x</a>');
    writeFileSync(join(d, "a.test.ts"), 'fetch("/api/ignored-in-tests");');
    const found = findRootAbsoluteUrls([d], d);
    expect(found).toHaveLength(4); // "/api/…", ${base}/api/…, src="/assets/…" (attribute + literal)
    expect(found.join("\n")).toContain("ui/a.ts:1");
    expect(found.join("\n")).toContain("ui/a.ts:2");
    expect(found.join("\n")).not.toContain("ui/a.ts:3");
    expect(() => findRootAbsoluteUrls([join(d, "missing")], d)).toThrow(/no such directory/);
  });
});
