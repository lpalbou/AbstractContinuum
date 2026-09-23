#!/usr/bin/env node
// Guard against stale compiled twins poisoning builds (incident 2026-07-16):
// a tsc run with emit enabled left src/**/*.js beside the .tsx sources, and
// Vite resolved extensionless imports to the STALE .js — every later .tsx
// edit silently never reached the bundle (same hash build after build).
// All src/ code is TypeScript; any .js/.js.map twin of a .ts/.tsx file is
// stale output by definition. Delete loudly, never silently skip.
import { readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const removed = [];
for (const p of walk(src)) {
  if (!p.endsWith(".js") && !p.endsWith(".js.map")) continue;
  const base = p.replace(/\.js(\.map)?$/, "");
  if (existsSync(`${base}.ts`) || existsSync(`${base}.tsx`)) {
    rmSync(p);
    removed.push(p);
  }
}
if (removed.length) {
  console.warn(`[clean_stale_js] removed ${removed.length} stale compiled twin(s) from src/ — these would have shadowed .tsx sources in the bundle:`);
  for (const p of removed) console.warn(`  - ${p}`);
}
