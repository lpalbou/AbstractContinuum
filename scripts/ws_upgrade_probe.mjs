// F7 acceptance probe (dm-99 tail, backlog 0019): the console server must
// survive hostile/broken WebSocket upgrades — garbage bytes after the
// handshake line, mid-handshake aborts, and an upstream hub that accepts
// TCP but never completes the WS handshake (handshake timer path).
//
// Usage: node scripts/ws_upgrade_probe.mjs
// Spawns the real bin/cli.js on a throwaway port with HUB_URL pointed at a
// black-hole TCP server, fires the attack set, then asserts the server
// still answers HTTP. Exits 1 on any failure.
import { spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";

const PORT = 3210;
const HOLE_PORT = 3211;

// Black-hole "hub": accepts TCP, never speaks (exercises the 15s handshake
// deadline without waiting it out — the probe only checks liveness).
const hole = net.createServer(() => {});
await new Promise((r) => hole.listen(HOLE_PORT, "127.0.0.1", r));

const child = spawn(process.execPath, ["bin/cli.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ABSTRACTCONTINUUM_HUB_URL: `http://127.0.0.1:${HOLE_PORT}`,
    ABSTRACTCONTINUUM_HUB_KEY: "probe-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let child_err = "";
child.stderr.on("data", (d) => (child_err += d.toString()));
await new Promise((r) => setTimeout(r, 900)); // let it bind

function http_ok() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/" }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const attacks = [
  // 1: upgrade line then garbage bytes.
  "GET /api/hub/ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n\x00\xff\x13garbage",
  // 2: upgrade headers, then instant RST-style abort (handled by destroy).
  "GET /api/hub/ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
  // 3: upgrade to a non-ws path (handled=false branch).
  "GET /not-ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
];

for (let i = 0; i < attacks.length; i++) {
  await new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1", () => {
      s.write(attacks[i]);
      // Abort rudely mid-flight: resetAndDestroy sends RST when available.
      setTimeout(() => {
        if (typeof s.resetAndDestroy === "function") s.resetAndDestroy();
        else s.destroy();
        resolve(null);
      }, i === 1 ? 30 : 250);
    });
    s.on("error", () => resolve(null));
  });
}

await new Promise((r) => setTimeout(r, 500));
const alive = await http_ok();
const exited = child.exitCode !== null;

child.kill("SIGTERM");
hole.close();

if (!alive || exited) {
  console.error(`FAIL: server ${exited ? `exited code=${child.exitCode}` : "not answering HTTP"} after hostile upgrades`);
  if (child_err) console.error("--- child stderr ---\n" + child_err.slice(-2000));
  process.exit(1);
}
console.log("OK: server survived garbage upgrade, mid-handshake abort, and non-ws upgrade (black-hole hub)");
