// One-off maintenance script: prune src/ui/styles.css (the full observer
// stylesheet copied at the 2026-07-12 split) down to the rules the continuum
// pages actually use.
//
// Keep predicate: a selector survives iff EVERY class token in it is in the
// keep set (classes used by our TSX + dynamic status suffixes + panel-chat
// `pc-*` internals we style from the host). Selectors with no class tokens
// (resets, element styles, :root) always survive. @keyframes survive iff a
// kept rule references them; @media blocks are filtered recursively.
//
// Usage: node scripts/prune_styles.mjs [--write]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSS_PATH = join(ROOT, "src", "ui", "styles.css");

// ---------------------------------------------------------------- keep set

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function collect_used_classes() {
  const used = new Set();
  const files = walk(join(ROOT, "src"));
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    // className="a b c"
    for (const m of text.matchAll(/className=\{?["'`]([^"'`]*)["'`]/g)) {
      for (const c of m[1].split(/\s+/)) if (c && !c.includes("$")) used.add(c);
    }
    // className={`a b ${...} c`}
    for (const m of text.matchAll(/className=\{`([^`]*)`\}/g)) {
      for (const c of m[1].split(/[^a-zA-Z0-9_-]+/)) if (c && !/^\d/.test(c)) used.add(c);
    }
    // any quoted string containing likely class lists (covers class vars)
    for (const m of text.matchAll(/["'`]([a-z][a-z0-9_ -]*)["'`]/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
  }
  return used;
}

// Dynamic classes composed at runtime (status/type chips, toggle states) —
// these come out of ternaries/maps and may not appear as contiguous strings.
const DYNAMIC = [
  "ok", "off", "muted", "warn", "danger", "info", "task", "error",
  "active", "open", "checked", "unparsed", "fullscreen", "primary",
  "is_loading",
];

// panel-chat internals we style from the host stylesheet.
const KEEP_PREFIXES = ["pc-"];

const used = collect_used_classes();
for (const c of DYNAMIC) used.add(c);

const css = readFileSync(CSS_PATH, "utf8");
const root = postcss.parse(css);

const class_re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;

function classes_of(selector) {
  const out = [];
  for (const m of selector.matchAll(class_re)) out.push(m[1]);
  return out;
}

function selector_kept(selector) {
  const classes = classes_of(selector);
  if (!classes.length) return true; // element/:root/universal selectors
  return classes.every((c) => used.has(c) || KEEP_PREFIXES.some((p) => c.startsWith(p)));
}

const dropped_classes = new Map();

function filter_container(container) {
  const to_remove = [];
  container.each((node) => {
    if (node.type === "rule") {
      if (node.parent?.type === "atrule" && /keyframes/i.test(node.parent.name)) return; // keyframe steps
      const kept = node.selectors.filter(selector_kept);
      if (!kept.length) {
        for (const sel of node.selectors) for (const c of classes_of(sel)) {
          dropped_classes.set(c, (dropped_classes.get(c) || 0) + 1);
        }
        to_remove.push(node);
      } else if (kept.length !== node.selectors.length) {
        node.selectors = kept;
      }
    } else if (node.type === "atrule") {
      if (/keyframes/i.test(node.name)) return; // handled in pass 2
      if (node.nodes) {
        filter_container(node);
        if (!node.nodes.length) to_remove.push(node);
      }
    }
  });
  for (const n of to_remove) n.remove();
}

filter_container(root);

// Pass 2: drop unreferenced keyframes.
const kept_css_text = root.toString();
root.each((node) => {
  if (node.type === "atrule" && /keyframes/i.test(node.name)) {
    const name = String(node.params || "").trim();
    const ref = new RegExp(`animation[^;]*\\b${name}\\b`);
    if (!ref.test(kept_css_text)) node.remove();
  }
});

// Pass 3: drop comments whose following section lost every rule (comment
// immediately followed by another comment or end of container).
function drop_orphan_comments(container) {
  const nodes = container.nodes || [];
  const to_remove = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.type !== "comment") continue;
    const next = nodes[i + 1];
    if (!next || next.type === "comment") to_remove.push(n);
  }
  for (const n of to_remove) n.remove();
  for (const n of nodes) if (n.type === "atrule" && n.nodes) drop_orphan_comments(n);
}
drop_orphan_comments(root);

const out = root.toString().replace(/\n{3,}/g, "\n\n");

const write = process.argv.includes("--write");
console.log(`used classes: ${used.size}`);
console.log(`dropped selector-classes: ${dropped_classes.size}`);
console.log(`before: ${css.split("\n").length} lines, after: ${out.split("\n").length} lines`);
if (write) {
  writeFileSync(CSS_PATH, out);
  console.log("written.");
} else {
  const sample = [...dropped_classes.keys()].sort().slice(0, 999);
  console.log("dropped classes:\n" + sample.join(", "));
}
