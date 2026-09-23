// Headless verification of the Leaderboard drawer (operator dm 58: no
// horizontal scrolling allowed — the table must FIT its drawer).
//
// Usage: node scripts/leaderboard_screenshot.mjs <out_prefix> [viewport_width]
// Asserts: no element on the drawer's cell path overflows horizontally,
// and window-level horizontal scroll is absent. Exits 1 on violation.
//
// Borrows the observer checkout's playwright install (same monorepo, same
// machine) — continuum deliberately doesn't add the dependency for a
// design pass.
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2] || "/tmp/continuum_lb";
const width = Number(process.argv[3] || 1440);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 940 } });

const page_errors = [];
page.on("pageerror", (e) => page_errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") console.error("[console.error]", m.text().slice(0, 200));
});

await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
const close_btn = page.getByRole("button", { name: "Close" });
if (await close_btn.count()) await close_btn.first().click().catch(() => {});

await page.getByRole("button", { name: "Team" }).click();
await page.waitForSelector(".team_channel", { timeout: 10_000 });

// Open the Leaderboard drawer via its trapeze tab.
await page.locator(".team_drawer_tab", { hasText: "Leaderboard" }).click();
await page.waitForSelector(".team_lb_pane", { timeout: 10_000 });
await page.waitForTimeout(800); // board fetch

const report = await page.evaluate(() => {
  const offenders = [];
  const check = (el, label) => {
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 1) {
      offenders.push(`${label}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
  };
  check(document.documentElement, "document");
  check(document.querySelector(".team_lb_pane"), ".team_lb_pane");
  check(document.querySelector(".team_lb_body"), ".team_lb_body");
  document.querySelectorAll(".team_lb_legend, .team_lb_row, .team_lb_detail").forEach((el, i) => {
    check(el, `${el.className.split(" ")[0]}[${i}]`);
  });
  const rows = document.querySelectorAll(".team_lb_row").length;
  const pane = document.querySelector(".team_lb_pane");
  return { offenders, rows, pane_width: pane ? pane.clientWidth : 0 };
});

await page.screenshot({ path: `${out}_board.png` });
const pane_el = page.locator(".team_lb_pane");
if (await pane_el.count()) await pane_el.first().screenshot({ path: `${out}_drawer.png` }).catch(() => {});

// Expanded row detail (vote casting UI) must fit too.
const first_row = page.locator(".team_lb_row").first();
if (await first_row.count()) {
  await first_row.click();
  await page.waitForTimeout(400);
  const detail_report = await page.evaluate(() => {
    const el = document.querySelector(".team_lb_detail");
    return el && el.scrollWidth > el.clientWidth + 1 ? `detail: ${el.scrollWidth} > ${el.clientWidth}` : null;
  });
  if (detail_report) report.offenders.push(detail_report);
  await pane_el.first().screenshot({ path: `${out}_drawer_open.png` }).catch(() => {});
}

console.log(`viewport=${width} rows=${report.rows} pane_width=${report.pane_width}`);
console.log(`written: ${out}_board.png, ${out}_drawer.png, ${out}_drawer_open.png`);
if (page_errors.length) {
  console.error("PAGE ERRORS:", page_errors.join(" | "));
}
if (report.offenders.length) {
  console.error("HORIZONTAL OVERFLOW:", report.offenders.join(" | "));
  process.exit(1);
}
console.log("no horizontal overflow \u2713");
await browser.close();
