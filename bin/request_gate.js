/**
 * "Is this request from this computer, and from this app's own page?" —
 * the ONE answer every app-local privileged route uses (the hub proxy,
 * which authors as the operator's seat, and the Settings route, which
 * steers it).
 *
 * Both questions go through @abstractframework/app-server's
 * `requestContext(req)`: behind the gateway's `/apps/continuum/` the socket
 * peer is ALWAYS loopback (the gateway), so the socket address says nothing
 * about the browser. The kit believes the gateway's X-Forwarded-For /
 * X-Forwarded-Host only from a loopback peer, and answers the browser's
 * address and the host the browser addressed.
 *
 *   - loopback: the BROWSER runs on this computer (`clientIsLoopback`).
 *   - same_origin: a declared Origin names the host the browser addressed
 *     (the forwarded host behind the gateway, else the Host header). An
 *     absent Origin passes: a browser never omits it on a cross-origin
 *     fetch or WebSocket handshake, so the vector this closes cannot dodge
 *     the check.
 *
 * Throws MountRequestError (status 400) for a malformed forwarded header or
 * an unknown socket peer; callers refuse the request.
 */

import { requestContext } from '@abstractframework/app-server';

export function request_gate(req) {
  const ctx = requestContext(req);
  return { ctx, loopback: ctx.clientIsLoopback, same_origin: origin_matches(req, ctx.host) };
}

function origin_matches(req, host) {
  const origin = String((req.headers && req.headers.origin) || '').trim();
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const want = String(host || '').trim().toLowerCase();
  return Boolean(want) && parsed.host.toLowerCase() === want;
}
