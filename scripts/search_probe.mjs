// Live UI probe: hub-wide search (agora-0132). Loads the running console,
// submits a query from the Team page search box, and verifies the grouped
// report renders (sections, marks, truncation lines). Screenshot artifact
// for the ship receipt.
import { createRequire } from "module";
import { resolve } from "path";
const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const BASE = process.env.CONSOLE_URL || "http://127.0.0.1:3002";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: ".af-connect-overlay, .modal_backdrop { display: none !important; }" });
  await page.keyboard.press("Escape");
  // The console is gateway-first: the Team tab is reachable without a
  // gateway session (hub proxy needs no sign-in) — click the nav tab.
  await page.click("text=Team", { timeout: 15000 });
  await page.waitForSelector(".team_search_input", { timeout: 15000 });
  await page.fill(".team_search_input", "delegation");
  await page.press(".team_search_input", "Enter");
  await page.waitForSelector(".team_search_results", { timeout: 15000 });
  await page.waitForSelector(".team_search_hit", { timeout: 15000 });
  const sections = await page.$$eval(".team_search_section_label", (els) => els.map((e) => e.textContent));
  const marks = await page.$$eval(".team_search_snippet mark", (els) => els.length);
  const truncated = await page.$$eval(".team_search_section_head .muted", (els) => els.map((e) => e.textContent));
  console.log("sections:", JSON.stringify(sections));
  console.log("marks:", marks);
  console.log("truncation lines:", JSON.stringify(truncated));
  await page.screenshot({ path: "untracked/search_probe.png", fullPage: false });
  console.log("screenshot: untracked/search_probe.png");
  // Relaxed banner probe: a natural question should trip the OR retry.
  await page.fill(".team_search_input", "who approved the kelp anyway zzz");
  await page.press(".team_search_input", "Enter");
  await page.waitForTimeout(1500);
  const relaxed = await page.$(".team_search_relaxed");
  console.log("relaxed banner on loose query:", Boolean(relaxed));
} finally {
  await browser.close();
}
