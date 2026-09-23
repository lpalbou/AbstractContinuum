// Rail-toolbar uniformity probe (operator dm 61): the hover rail's acts —
// thumbs + Reply (+ Resolve when present) — must share ONE vertical line
// (same top, same height) and the SAME cast shadow.
//
// Usage: node scripts/rail_probe.mjs [out_png]
// Exits 1 when any rail control diverges in top/height or drops the shadow.
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2] || "/tmp/continuum_rail.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
const close_btn = page.getByRole("button", { name: "Close" });
if (await close_btn.count()) await close_btn.first().click().catch(() => {});
await page.getByRole("button", { name: "Team" }).click();
await page.waitForSelector(".team_row", { timeout: 10_000 });

// Hover a row authored by ANOTHER seat so the thumbs render (own rows
// carry no thumbs — self-votes are refused).
const rows = page.locator(".team_row:not(.own)");
const n = await rows.count();
let report = null;
for (let i = 0; i < Math.min(n, 20) && !report; i++) {
  const row = rows.nth(i);
  await row.hover().catch(() => {});
  await page.waitForTimeout(120);
  report = await page.evaluate(() => {
    const rail = document.querySelector(".team_row:hover .team_row_rail");
    if (!rail) return null;
    const btns = [...rail.querySelectorAll("button")];
    if (btns.length < 3) return null; // want thumbs + Reply at least
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return { label: (b.textContent || "thumb").trim() || "thumb", top: Math.round(r.top * 2) / 2, height: Math.round(r.height * 2) / 2, shadow: cs.boxShadow };
    });
  });
}

if (!report) {
  console.error("no rail with >=3 controls found (no foreign-authored rows on screen?)");
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: out });
console.log(JSON.stringify(report, null, 1));
const tops = new Set(report.map((b) => b.top));
const heights = new Set(report.map((b) => b.height));
// Every control must CONTAIN the shared cast shadow (pressed thumbs add an
// inset ring in the same list — allowed; dropping the shadow is not).
const missing_shadow = report.filter((b) => !/rgba\(0, 0, 0, 0\.3\) 0px 1px 3px/.test(b.shadow));
if (tops.size > 1 || heights.size > 1 || missing_shadow.length) {
  console.error(`MISALIGNED: tops=${[...tops]} heights=${[...heights]} missing_shadow=${missing_shadow.map((b) => b.label)}`);
  await browser.close();
  process.exit(1);
}
console.log(`aligned \u2713 top=${[...tops][0]} height=${[...heights][0]} shadow shared \u2713 (${report.length} controls)`);
await browser.close();
