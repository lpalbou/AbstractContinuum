#!/usr/bin/env node

/**
 * CLI entry point for AbstractContinuum
 * Serves the built console and proxies /api/* to the gateway through the
 * shared app-origin session proxy (first-party cookies + CSRF; tokens never
 * in URLs) — the same @abstractframework/app-server module the observer,
 * flow, and code apps converge on.
 */

import * as http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGatewaySessionProxy } from '@abstractframework/app-server';
import { createHubProxy } from './hub_proxy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const argv = process.argv.slice(2);
if (argv.includes('--version') || argv.includes('-v')) {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: abstractcontinuum [--help] [--version]

Serves the AbstractContinuum console and proxies /api/* to a Run Gateway
through a same-origin session proxy. Configuration is environment-driven:

  PORT                            HTTP port (default 3002)
  HOST                            bind address (default 127.0.0.1)
  ABSTRACTCONTINUUM_GATEWAY_URL   gateway URL (fallback ABSTRACTGATEWAY_URL,
                                  default http://127.0.0.1:8080)
  ABSTRACTCONTINUUM_HUB_URL       agora hub for the Team page (fallback
                                  AGORA_HUB_URL, default http://127.0.0.1:8765)
  ABSTRACTCONTINUUM_HUB_SEAT      hub seat the Team page acts as; set it to
                                  your own seat (default operator)
  ABSTRACTCONTINUUM_HUB_KEYS      hub key store (default ~/.agora/keys.json)
  ABSTRACTCONTINUUM_HUB_KEY       hub API key (overrides the key store)
  ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE
                                  1 lets browsers on other machines use the
                                  hub proxy (default off; only behind your
                                  own access control)

Sign-in proxy hardening (all default off):

  ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG
    (or ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG)
                                  let browsers on other machines change the
                                  gateway URL at sign-in
  ABSTRACTCONTINUUM_ALLOW_BROWSER_GATEWAY_URL_COOKIE
                                  honor a browser-supplied gateway URL cookie
                                  on non-loopback hosts
  ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS
    (or ABSTRACTGATEWAY_TRUST_PROXY_HEADERS)
                                  trust x-forwarded-host for the loopback
                                  check (only behind a reverse proxy you
                                  control)

Documentation: https://github.com/lpalbou/AbstractContinuum#readme`);
  process.exit(0);
}

const PORT = process.env.PORT || 3002;
// Default bind is LOOPBACK (entity's c1768 SSRF finding against the shared
// session proxy, plus a continuum-specific amplifier: this server also
// mounts the hub proxy carrying the OPERATOR's seat key — a LAN peer
// reaching the port could author hub messages as the operator). Wider
// binds are an explicit deployment choice via HOST.
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_GATEWAY_URL = String(process.env.ABSTRACTCONTINUUM_GATEWAY_URL || process.env.ABSTRACTGATEWAY_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '') || 'http://127.0.0.1:8080';
const HUB_URL = String(process.env.ABSTRACTCONTINUUM_HUB_URL || process.env.AGORA_HUB_URL || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
const HUB_SEAT = String(process.env.ABSTRACTCONTINUUM_HUB_SEAT || 'operator').trim();
const HUB_KEYS_PATH = String(process.env.ABSTRACTCONTINUUM_HUB_KEYS || join(homedir(), '.agora', 'keys.json'));

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Content-Security-Policy for the app document (security adversary P1
// 2026-07-16): untrusted markdown (channel files, messages, attachments)
// renders in this app, and standard markdown allows remote images — a
// crafted ![](https://attacker/beacon.png) would beacon the operator's IP
// and read-timing to an external host the moment a preview opens. img-src
// 'self' data: kills that class app-wide. script-src 'self' is a backstop
// belt (the renderer already cannot emit script). ws:/wss: are needed
// because 'self' does not reliably cover scheme-different WebSocket dials;
// only our own bundle can open sockets (script-src), so this stays tight.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React style={} attributes
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function serveFile(res, filePath) {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return false;
    }
    const content = readFileSync(filePath);
    const mime = getMimeType(filePath);
    const headers = {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    // CSP is a document policy — attach it where a document loads.
    if (mime === 'text/html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// Cookies abstractcontinuum_gateway_*, header x-abstractcontinuum-csrf, and
// the ABSTRACTCONTINUUM_* / ABSTRACTGATEWAY_* env gates all derive from appId.
const gatewaySessionProxy = createGatewaySessionProxy({
  appId: 'abstractcontinuum',
  defaultGatewayUrl: DEFAULT_GATEWAY_URL,
});

// Team page transport: /api/hub/* forwards an allowlisted hub API subset
// with the OPERATOR seat's key attached server-side (proposal c1692,
// agency contract c1696 — authorship stays the operator's own).
const hubProxy = createHubProxy({ hubUrl: HUB_URL, seat: HUB_SEAT, keysPath: HUB_KEYS_PATH });

const server = http.createServer((req, res) => {
  // Parse against a FIXED base: a malformed Host header (e.g. "a b") makes
  // new URL throw synchronously, which would kill the whole process from
  // one bad request (adversarial P1 2026-07-13). The host plays no role in
  // routing here — only the pathname does.
  let pathname = '/';
  let search = '';
  try {
    const u = new URL(req.url, 'http://local');
    pathname = u.pathname;
    search = u.search;
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (hubProxy.handle(req, res, pathname, search)) {
    return;
  }

  if (gatewaySessionProxy.handle(req, res, pathname)) {
    return;
  }

  if (pathname.includes('..')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const filePath = join(DIST_DIR, pathname);
  if (serveFile(res, filePath)) return;
  if (serveFile(res, filePath + '.html')) return;

  // SPA fallback
  if (serveFile(res, join(DIST_DIR, 'index.html'))) return;

  res.writeHead(404);
  res.end('Not Found');
});

// Live hub updates: relay browser WebSockets to the hub with the seat key
// attached server-side (operator c2240 — realtime, not 5s polling).
server.on('upgrade', (req, socket, head) => {
  // F7 (dm-99 tail): a raw upgrade socket with no 'error' listener is a
  // process-killer (browser aborts mid-handshake raise uncaught 'error');
  // and a rejected relay promise without .catch is an unhandled rejection.
  socket.on('error', () => {
    try { socket.destroy(); } catch { /* already gone */ }
  });
  void hubProxy.handleUpgrade(req, socket, head).then((handled) => {
    if (!handled) socket.destroy();
  }).catch(() => {
    try { socket.destroy(); } catch { /* already gone */ }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`
AbstractContinuum is running.
  Local:   http://localhost:${PORT}
  Gateway: ${DEFAULT_GATEWAY_URL}
`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
