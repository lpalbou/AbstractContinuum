#!/usr/bin/env node
// Regenerates llms-full.txt from the core docs (README, docs pages linked
// from docs/README.md in this order, SECURITY, CONTRIBUTING, CHANGELOG).
// Run from the repo root after any documentation change:
//   node scripts/gen_llms_full.mjs            # write llms-full.txt
//   node scripts/gen_llms_full.mjs --check    # exit 1 when it is stale
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  "README.md",
  "docs/getting-started.md",
  "docs/architecture.md",
  "docs/api.md",
  "docs/configuration.md",
  "docs/security.md",
  "docs/conventions.md",
  "docs/faq.md",
  "docs/troubleshooting.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
];

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
let out = `# AbstractContinuum — full documentation corpus

> Aggregated from the core docs for LLM/tool consumption (package
> \`@abstractframework/continuum\` ${version}). Canonical sources live in the
> repository; this file is regenerated whenever the docs change.

---
`;
SOURCES.forEach((src, i) => {
  const body = readFileSync(join(ROOT, src), "utf8").replace(/\s+$/, "");
  out += `\n<!-- source: ${src} -->\n\n${body}\n${i < SOURCES.length - 1 ? "\n---\n" : ""}`;
});
const target = join(ROOT, "llms-full.txt");
if (process.argv.includes("--check")) {
  const cur = readFileSync(target, "utf8");
  if (cur !== out) {
    console.error("llms-full.txt is stale: run node scripts/gen_llms_full.mjs");
    process.exit(1);
  }
  console.log("llms-full.txt is current");
} else {
  writeFileSync(target, out);
  console.log(`wrote llms-full.txt (${out.length} chars, ${SOURCES.length} sources)`);
}
