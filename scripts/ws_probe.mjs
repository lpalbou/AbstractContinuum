// Chromium probe for the hub WS relay: open, subscribe (the real client's
// first frame), then hold the socket and log every event for 8s.
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "../abstractobserver/package.json"));
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:3005";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
const result = await page.evaluate(
  () =>
    new Promise((done) => {
      const out = { opened: false, frames: [], error: "", closed: "" };
      const ws = new WebSocket(`ws://${location.host}/api/hub/ws`);
      setTimeout(() => {
        try {
          ws.close(1000, "probe done");
        } catch {
          /* closed */
        }
        done(out);
      }, 8000);
      ws.onopen = () => {
        out.opened = true;
        ws.send(JSON.stringify({ type: "subscribe", channels: ["commons"] }));
      };
      ws.onmessage = (ev) => out.frames.push(String(ev.data).slice(0, 100));
      ws.onerror = () => {
        out.error = "ws error event";
      };
      ws.onclose = (ev) => {
        out.closed = `${ev.code} ${ev.reason || ""}`.trim();
      };
    }),
  undefined
);
await browser.close();
console.log(JSON.stringify(result, null, 1));
