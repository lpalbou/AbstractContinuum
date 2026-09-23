// Headless verification for two operator asks (2026-07-17):
//  1. /group composer preview (agora dm 23): typing the command shows the
//     derived room slug + roster and flips Send to "Create room" — typed
//     ONLY, never sent (probes must not post; dm 49 lesson).
//  2. Unread visibility (operator dm 63): when the seat has unread, the
//     Unread filter shows rows and unread rows carry the labeled "new"
//     pill — verified WITHOUT clicking any row (a click would fire a real
//     read+ack under the operator seat).
// Usage: node scripts/group_unread_probe.mjs [out_prefix]
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2] || "/tmp/continuum_gu";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
const close_btn = page.getByRole("button", { name: "Close" });
if (await close_btn.count()) await close_btn.first().click().catch(() => {});
await page.getByRole("button", { name: "Team" }).click();
await page.waitForSelector(".team_channel", { timeout: 10_000 });
await page.waitForTimeout(800);

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error("FAIL:", msg);
};

// ---- 1. /group preview (type, never send)
const ta = page.locator(".team_compose_text");
await ta.fill("/group fix the voice outage @gateway @core");
await page.waitForTimeout(250);
const preview = page.locator(".team_group_preview");
if (!(await preview.count())) fail("no /group preview rendered");
else {
  const text = (await preview.innerText()).replace(/\s+/g, " ");
  if (!text.includes("fix-the-voice-outage")) fail(`preview slug wrong: ${text}`);
  if (!text.includes("@gateway") || !text.includes("@core")) fail(`preview roster wrong: ${text}`);
}
const send_label = (await page.locator(".team_send").innerText()).trim();
if (send_label !== "Create room") fail(`send label = "${send_label}" (wanted "Create room")`);
await page.screenshot({ path: `${out}_group_preview.png` });
// Mentionless usage hint:
await ta.fill("/group just a topic");
await page.waitForTimeout(200);
const hint = (await page.locator(".team_group_preview").innerText().catch(() => "")).toLowerCase();
if (!hint.includes("needs @mentions")) fail(`mentionless hint missing: ${hint}`);
await ta.fill(""); // leave the composer clean

// ---- 2. Unread rendering (look, don't touch)
// Find a channel with an unread badge; open it with the Unread filter via
// the badge (the shipped affordance), then check chips WITHOUT clicking rows.
const badge = page.locator(".team_badge.unread").first();
if (!(await badge.count())) {
  console.log("unread check: seat has zero unread right now — render path not exercisable live (unit pins cover the filter; rerun when a badge exists)");
} else {
  await badge.click();
  await page.waitForTimeout(900);
  const rows = await page.locator(".team_row.unread").count();
  const chips = await page.locator(".team_chip_new").count();
  const shown = await page.locator(".team_row").count();
  console.log(`unread view: ${shown} rows on screen, ${rows} unread-tinted, ${chips} 'new' chips`);
  if (!shown) fail("Unread filter shows NOTHING under a nonzero badge (the dm 63 complaint)");
  if (!chips) fail("no 'new' chips rendered under the Unread filter");
  await page.screenshot({ path: `${out}_unread.png` });
}

console.log(`written: ${out}_group_preview.png${(await page.locator(".team_badge.unread").count()) ? `, ${out}_unread.png` : ""}`);
if (failures) process.exit(1);
console.log("probe green \u2713");
await browser.close();
