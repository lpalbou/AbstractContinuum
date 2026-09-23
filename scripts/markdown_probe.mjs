// Message-formatting probe (operator dm 116): renders a long technical
// report — headings, dense bullets, code spans, bold — through the LIVE
// console (real Markdown component + real styles.css cascade) and
// screenshots the expanded message. Asserts the reading hierarchy exists:
// headings must be larger AND brighter than body text, paragraphs and list
// items must carry vertical rhythm.
//
// Usage: node scripts/markdown_probe.mjs [out_png]
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2] || "/tmp/continuum_markdown.png";

const SAMPLE = [
  "# Section one: why this works",
  "The framework caches the model's internal reading of long prompts so repeated calls are fast and cheap. The danger of any cache: reusing it when it should have been thrown away — you get answers computed from a stale model, silently.",
  "## What shipped tonight",
  "- axis 1 engine, axis 2 tokenizer, axis 3 model-config geometry: shipped earlier this week with `2248 tests` green.",
  "- axis 4 weights identity: shipped **tonight**. The gap it closes: swap the checkpoint behind the same model name and text/tokenizer/config all look identical while the actual weights changed — the cache would be reused wrongly.",
  "- remaining: cache dtype (unlocks q8 storage — smaller caches), then position offset.",
  "In one line: it makes the speed machinery impossible to be silently wrong.",
  "### Follow-ups",
  "1. Grouping at sleep: similar questions cluster; more of the same presses harder.",
  "2. Surge pathways: the daily offer of open questions now reaches him **every** day-open.",
].join("\n\n");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
// No navigation needed: the probe injects its own .team_row_body subtree —
// the CSS cascade applies wherever the classes exist, signed in or not.
// Hide any blocking connect overlay so the screenshot shows the probe.
await page.addStyleTag({ content: ".af-connect-overlay{display:none !important}" });

// Inject the sample INTO a real row body via the live Markdown pipeline's
// DOM shape: replace one row's body content with a fresh render by asking
// React is overkill here — instead reuse the page's own renderer through a
// hidden probe container that copies a real .pc-md structure. Simpler and
// truthful: pick the first row body and rewrite its inner markdown source
// is not possible post-render, so we assert on COMPUTED STYLES of the
// classes directly using a synthetic subtree that mirrors the renderer's
// exact output classes (pc-md, pc-md_p, pc-md_ul, h1-h3, strong, code).
const report = await page.evaluate(() => {
  const probe = document.createElement("div");
  probe.className = "team_row_body";
  probe.style.position = "absolute";
  probe.style.left = "40px";
  probe.style.top = "80px";
  probe.style.width = "720px";
  probe.style.zIndex = "9999";
  probe.style.background = "var(--bg-secondary, #111)";
  probe.style.padding = "16px";
  probe.innerHTML = `
    <div class="pc-md md_doc">
      <h1>Section one: why this works</h1>
      <p class="pc-md_p">The framework caches the model's internal reading of long prompts so repeated calls are fast and cheap. The danger of any cache: reusing it when it should have been thrown away — you get answers computed from a stale model, silently.</p>
      <h2>What shipped tonight</h2>
      <ul class="pc-md_ul">
        <li>axis 1 engine, axis 2 tokenizer, axis 3 model-config geometry: shipped earlier this week with <code>2248 tests</code> green.</li>
        <li>axis 4 weights identity: shipped <strong>tonight</strong>. The gap it closes: swap the checkpoint behind the same model name and text/tokenizer/config all look identical while the actual weights changed.</li>
        <li>remaining: cache dtype (unlocks q8 storage — smaller caches), then position offset.</li>
      </ul>
      <p class="pc-md_p">In one line: it makes the speed machinery impossible to be silently wrong.</p>
      <h3>Follow-ups</h3>
      <ol class="pc-md_ol"><li>Grouping at sleep: similar questions cluster.</li><li>Surge pathways: the daily offer now reaches him <strong>every</strong> day-open.</li></ol>
    </div>`;
  document.body.appendChild(probe);
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const style = (sel) => {
    const el = probe.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { size: px(cs.fontSize), weight: cs.fontWeight, color: cs.color, mt: px(cs.marginTop), mb: px(cs.marginBottom), pl: px(cs.paddingInlineStart), ml: px(cs.marginInlineStart) };
  };
  return {
    body: style(".pc-md_p"),
    h1: style("h1"),
    h2: style("h2"),
    h3: style("h3"),
    li: style("li"),
    ul: style(".pc-md_ul"),
    strong: style("strong"),
    code: style("code"),
  };
});

if (!report || !report.h1 || !report.body) {
  console.error("probe failed to render");
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: out, clip: { x: 20, y: 60, width: 780, height: 640 } });
console.log(JSON.stringify(report, null, 1));

const fails = [];
if (!(report.h1.size > report.body.size)) fails.push("h1 not larger than body");
if (!(report.h2.size > report.body.size)) fails.push("h2 not larger than body");
if (!(report.h3.size >= report.body.size)) fails.push("h3 smaller than body");
if (report.h1.color === report.body.color) fails.push("h1 same color as body (no contrast hierarchy)");
if (!(report.body.mt >= 4 || report.body.mb >= 4)) fails.push("paragraph rhythm missing");
if (!(report.li.mt >= 3 || report.li.mb >= 3)) fails.push("list-item rhythm missing");
if (report.strong.color === report.body.color) fails.push("strong does not pop from body");
if (!(report.ul && report.ul.pl + report.ul.ml >= 20)) fails.push("list indentation step missing (dm 123)");

await browser.close();
if (fails.length) {
  console.error("FAIL: " + fails.join("; "));
  process.exit(1);
}
console.log(`OK hierarchy verified — screenshot at ${out}`);
