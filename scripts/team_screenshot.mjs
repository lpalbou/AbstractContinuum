// Headless render of the Team page for the design-iteration loop
// (operator 2026-07-14 21:32: refine look/feel, render headless, iterate
// with adversaries until production-ready).
//
// Usage: node scripts/team_screenshot.mjs <out_prefix> [viewport_width]
// Produces <out_prefix>_full.png (whole Team page) and
// <out_prefix>_thread.png (the thread pane region).
//
// Borrows the observer checkout's playwright install (same monorepo, same
// machine) — continuum deliberately doesn't add the dependency for a
// design pass.
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2] || "/tmp/continuum_team";
const width = Number(process.argv[3] || 1440);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 940 } });

page.on("console", (m) => {
  if (m.type() === "error") console.error("[console.error]", m.text().slice(0, 200));
});

await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

// Dismiss the connect modal if it auto-opened (gateway may be down; the
// Team page is hub-only and must render regardless).
const close_btn = page.getByRole("button", { name: "Close" });
if (await close_btn.count()) await close_btn.first().click().catch(() => {});

await page.getByRole("button", { name: "Team" }).click();
// Hub data: channels rail + first channel's messages.
await page.waitForSelector(".team_channel", { timeout: 10_000 });
await page.waitForSelector(".team_thread_group", { timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(1200);

await page.screenshot({ path: `${out}_full.png` });
const thread_pane = page.locator(".team_thread_pane");
if (await thread_pane.count()) {
  await thread_pane.first().screenshot({ path: `${out}_thread.png` });
}
// Scroll the thread list to the bottom half for a second density sample.
await page.evaluate(() => {
  const el = document.querySelector(".team_thread");
  if (el) el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}_bottom.png` });

// Composer states (operator 2026-07-15: the input row layout must be
// verified rendered, not assumed): dm kind selected in a channel, then a
// dm:* conversation's composer.
const composer = page.locator(".team_composer");
const kind = page.locator(".team_kind_select");
if (await kind.count()) {
  await kind.selectOption("dm").catch(() => {});
  await page.waitForTimeout(300);
  await composer.screenshot({ path: `${out}_composer_dm_kind.png` }).catch(() => {});
  await kind.selectOption("fyi").catch(() => {});
}
const dm_chan = page.locator(".team_channel", { hasText: "@" }).first();
if (await dm_chan.count()) {
  await dm_chan.click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}_dm_view.png` });
  await composer.screenshot({ path: `${out}_dm_composer.png` }).catch(() => {});
}

console.log(`written: ${out}_full.png, ${out}_thread.png, ${out}_bottom.png, ${out}_composer_dm_kind.png, ${out}_dm_view.png`);
await browser.close();
