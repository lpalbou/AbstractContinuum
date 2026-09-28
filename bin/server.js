/**
 * The AbstractContinuum HTTP server: the built console, the app-origin
 * gateway session proxy (/api/* → the gateway), the Team page's hub proxy
 * (/api/hub/*, HTTP + the /api/hub/ws relay) and the Settings route.
 *
 * Mountable under the gateway at /apps/continuum/ (the
 * @abstractframework/app-server mount contract): every response, the
 * WebSocket 101 included, announces `X-AbstractFramework-App: continuum;
 * mount=1`; the page gets `<base href="<base path>/">` and `base_path`;
 * cookies carry `Path=<base path>/`; and every "is this the operator's own
 * computer?" check reads the kit's requestContext (bin/request_gate.js),
 * never the socket peer. Served at `/` on its own port it works exactly as
 * before.
 */

import * as http from 'http';
import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import {
  MountRequestError,
  createGatewaySessionProxy,
  createGatewayUrlResolver,
  createMountedHandler,
  injectShell,
  rejectUpgrade,
  requestContext,
} from '@abstractframework/app-server';
import { APP_ID, createHubProxy } from './hub_proxy.js';
import { createSettingsRoute, expand_home } from './settings.js';

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

/**
 * settings: live settings (bin/settings.js createLiveSettings); distDir: the
 * built console. The gateway URL, like the port and host, is read once from
 * the settings at creation.
 */
export function createContinuumServer({ settings, distDir }) {
  const AT_START = settings.get();
  const DEFAULT_GATEWAY_URL = AT_START.gateway_url.value;
  const DIST_DIR = distDir;
  // A gateway URL nobody chose (the local gateway pointer, or the built-in
  // default) follows the pointer while the server runs: the kit's resolver
  // re-reads it when the gateway refuses a connection. A flag, setting or
  // environment choice never moves.
  const CHOSEN_GATEWAY = ['flag', 'setting', 'env'].includes(AT_START.gateway_url.source);

  /**
   * The console document for one request: the kit's injectShell puts
   * `<base href="<base path>/">` first in <head> (every relative asset and
   * fetch resolves under /apps/continuum/ behind the gateway, under / on the
   * app's own port) plus `window.__ABSTRACT_UI_CONFIG__` (gateway_url,
   * base_path) in one inline script. The CSP admits exactly that script by
   * its hash; every other inline script stays refused.
   */
  function shellResponse(html, ctx) {
    const page = injectShell(html, { basePath: ctx.basePath, config: { gateway_url: gatewaySessionProxy.defaultGatewayUrl } });
    const inline = /<base [^>]*><script>([\s\S]*?)<\/script>/.exec(page);
    if (!inline) throw new Error('injectShell produced no inline config script');
    const hash = createHash('sha256').update(inline[1], 'utf8').digest('base64');
    const csp = CSP.replace("script-src 'self'", `script-src 'self' 'sha256-${hash}'`);
    return { page, csp };
  }

  function serveFile(res, filePath, ctx) {
    try {
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return false;
      }
      const mime = getMimeType(filePath);
      const headers = {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      };
      if (mime === 'text/html') {
        // CSP is a document policy — attach it where a document loads.
        const { page, csp } = shellResponse(readFileSync(filePath, 'utf8'), ctx);
        headers['Content-Type'] = 'text/html; charset=utf-8';
        headers['Content-Security-Policy'] = csp;
        res.writeHead(200, headers);
        res.end(page);
        return true;
      }
      res.writeHead(200, headers);
      res.end(readFileSync(filePath));
      return true;
    } catch {
      return false;
    }
  }

  // Cookies abstractcontinuum_gateway_* and header x-abstractcontinuum-csrf
  // derive from appId; mounted, the cookies carry Path=/apps/continuum/.
  const gatewaySessionProxy = createGatewaySessionProxy({
    appId: 'abstractcontinuum',
    defaultGatewayUrl: CHOSEN_GATEWAY ? DEFAULT_GATEWAY_URL : createGatewayUrlResolver({}),
  });

  // Team page transport: /api/hub/* forwards an allowlisted hub API subset
  // with the OPERATOR seat's key attached server-side (proposal c1692,
  // agency contract c1696 — authorship stays the operator's own).
  // Every hub setting is a getter: a seat saved on the Settings page or with
  // `abstractcontinuum config set` applies without a restart.
  const hubProxy = createHubProxy({
    hubUrl: () => settings.value('hub_url'),
    seat: () => settings.value('hub_seat'),
    keysPath: () => expand_home(settings.value('hub_keys')),
    token: () => settings.value('hub_token'),
    allowRemote: () => settings.value('hub_allow_remote'),
  });

  // The Settings page's door to this server's own settings (hub seat).
  const settingsRoute = createSettingsRoute({ live: settings });

  const server = http.createServer(createMountedHandler({ appId: APP_ID }, (req, res, ctx) => {
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

    if (settingsRoute.handle(req, res, pathname)) {
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
    if (serveFile(res, filePath, ctx)) return;
    if (serveFile(res, filePath + '.html', ctx)) return;

    // SPA fallback
    if (serveFile(res, join(DIST_DIR, 'index.html'), ctx)) return;

    res.writeHead(404);
    res.end('Not Found');
  }));

  // Live hub updates: relay browser WebSockets to the hub with the seat key
  // attached server-side (operator c2240 — realtime, not 5s polling).
  server.on('upgrade', (req, socket, head) => {
    // F7 (dm-99 tail): a raw upgrade socket with no 'error' listener is a
    // process-killer (browser aborts mid-handshake raise uncaught 'error');
    // and a rejected relay promise without .catch is an unhandled rejection.
    socket.on('error', () => {
      try { socket.destroy(); } catch { /* already gone */ }
    });
    // A malformed forwarded header or an unknown peer: refused before any
    // route (the kit's rule; the hub relay applies it again for its gate).
    try {
      requestContext(req);
    } catch (e) {
      if (!(e instanceof MountRequestError)) throw e;
      rejectUpgrade(socket, e.status, e.message);
      return;
    }
    void hubProxy.handleUpgrade(req, socket, head).then((handled) => {
      if (!handled) rejectUpgrade(socket, 404, 'No WebSocket here.');
    }).catch(() => {
      try { socket.destroy(); } catch { /* already gone */ }
    });
  });

  return server;
}
