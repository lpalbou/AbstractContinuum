/**
 * Agora hub proxy — the Team page's transport (proposal c1692, agency's
 * contract c1696).
 *
 * Serves /api/hub/* by forwarding an ALLOWLISTED subset of the hub HTTP
 * API with the OPERATOR seat's key attached server-side. The key comes
 * from the operator's standard key store (~/.agora/keys.json) or env; it
 * never appears in the browser, a repo, or a URL (the c1556 rule
 * generalized from charter reads to the whole chat surface).
 *
 * Contract rules honored here (agency c1696):
 * - Only allowlisted paths forward — the proxy is a door, not a tunnel.
 * - GET /api/hub/meta names the seat so the UI can render authorship
 *   honestly ("posting as <seat>").
 * - Ack/read_message are ordinary POSTs the UI calls on EXPLICIT read
 *   only (never on render) — enforced UI-side, but the proxy exposes
 *   them as distinct paths so an audit can see which fired.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/** Console version for the hub's X-Agora-Client handshake (read once at
 *  boot; "0.0.0" only if package.json is unreadable — the header's job is
 *  identifying a CURRENT client, so presence matters more than the number). */
const CONSOLE_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
})();

/** Allowlisted hub routes (method + path regex against the hub path).
 *  `keyless: true` marks routes the hub itself serves unauthenticated
 *  (healthz) — they forward even when no seat key is provisioned, so the
 *  protocol pin works on a read-only deployment.
 *
 *  DM EXCLUSION (c1696 rule 4, adversary find): channel names are simple
 *  slugs — the only hub channels containing ":" are `dm:*`, so the
 *  channel character class deliberately omits ":" and the former /dms/*
 *  routes are gone. DMs carry blind-vote ballots and stay OFF this
 *  surface structurally, not by UI convention. */
const HUB_ROUTES = [
  { method: 'GET', re: /^\/healthz$/, keyless: true },
  { method: 'GET', re: /^\/whoami$/ },
  // Hub-wide search (agora-0132, hub ≥ 0.12.44 `search-grouped`): read-only
  // grouped report, membership-scoped SERVER-side to the seat key's own
  // channels — the proxy adds no scoping because the hub already refuses
  // non-member hits structurally (golden vector pins it). Query params ride
  // through untouched (q/channel/sender/kind/since/until/ref/sort/limit/
  // cursor). Admin ops (rebuild/drift) stay OFF this surface deliberately.
  { method: 'GET', re: /^\/search$/ },
  { method: 'GET', re: /^\/channels$/ },
  // OPERATOR DIRECTIVE 2026-07-15 (c2240): channel management + DMs are
  // now first-class on this surface — the channel class includes ":" so
  // dm:* channels READ here (the operator's own seat, his own ballots;
  // the earlier dm-exclusion protected agents' surfaces, his call
  // supersedes it for his console). Writes stay allowlisted per route.
  { method: 'POST', re: /^\/channels$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages$/ },
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages\/[A-Za-z0-9_-]+$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/info$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/members$/ },
  // Leave a channel (operator dm 14: a DM trash icon). Removes the seat's
  // OWN membership — the channel drops off the member-scoped list. Non-
  // destructive: history persists hub-side; a DM reopens on next contact.
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/leave$/ },
  // Virtual filesystem: LIST (table of contents, no content) + READ one
  // file (operator dm 35 — a per-channel /fs browser). Read-only; any
  // member key serves it. Writes/deletes stay off this surface.
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/fs$/ },
  // fs READ charset mirrors what the hub itself accepts for paths (it
  // rejects only backslash/control chars/dot-segments) — the old
  // [A-Za-z0-9_./-] class 403'd LISTED files with spaces, unicode, or
  // '+' in their names: a click-to-error surface (adversarial find,
  // operator dm 93 class). Dot-segment refusal stays proxy-side too.
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/fs\/(?!(?:.*\/)?\.\.(?:\/|$))[^\x00-\x1f\\]+$/ },
  // Verbatim transcript for INDEPENDENT client-side chain verification
  // (Team page "Verify transcript"; hub docs/protocol.md "Verbatim
  // ledger"). Read-only; any member key serves it.
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/ledger$/ },
  // Actionable-state digest (open questions / decided) — feeds the Team
  // page's per-channel vigilance badges. Read-only.
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/digest$/ },
  // Channel lifecycle: closed-state lives in the channel:meta store key
  // (owner/operator writable hub-side). channel:meta stays the ONLY
  // writable key; the unification vote (Option A, c3010 + S3) opened the
  // general store READ-ONLY — claim:/decision: rows are the board's
  // annotation lane (pointer claims join backlog files by work id).
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/store$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/store\/[A-Za-z0-9_.:-]+$/ },
  { method: 'PUT', re: /^\/channels\/[A-Za-z0-9_.:-]+\/store\/channel:meta$/ },
  // reactions:* store WRITES are CLOSED (operator dm 150 "one reputation
  // score system"): the store convention stranded 26 operator votes where
  // reputation could not see them. Votes go through the rating verbs
  // below; this route's removal makes re-stranding structurally
  // impossible from this surface (reads stay open for audits).
  // Work-id activity index (agora 0093, S2): every claim/decision/message
  // citing one work id across the seat's channels — the card drawer's
  // one-call render source. Read-only; activates when the hub reaches
  // 0.12.12 (feature-detected client-side until then).
  { method: 'GET', re: /^\/work\/[A-Za-z0-9_.-]+$/ },
  // Unified-backlog list (agora blessing c3345, ships 0.12.19): all
  // work:* rows of a channel in ONE call — replaces the store-paging
  // read when live (feature-detected).
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/work$/ },
  // Operator desk (dm:agora--continuum contract, hub half in flight):
  // everything blocked on the operator, one read, operator-only
  // hub-side. Feature-detected (404 until agora ships).
  { method: 'GET', re: /^\/desk$/ },
  // Owed report (comms-audit ask 2, dm:agora--continuum#102): the viewer's
  // own debts + to_consume (answers to their OWN asks not yet used). The
  // console renders to_consume as a sticky "answers waiting on you" rail so
  // an answer to the operator's question never hides behind an unopened
  // surface (the #155-never-read incident).
  { method: 'GET', re: /^\/owed$/ },
  // Message retraction (agora 0097, operator dm 88): author-only +
  // operator override; the hub redacts at every read and clears the
  // obligation. Live at hub >= 0.12.16.
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages\/[A-Za-z0-9]+\/retract$/ },
  // Moderation (kick/ban): channel-scope blocks (owner/operator) and
  // hub-wide blocks (operator-only — the hub enforces authority; the
  // proxy only carries the operator seat's own key).
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/blocks$/ },
  { method: 'DELETE', re: /^\/channels\/[A-Za-z0-9_.:-]+\/blocks\/[A-Za-z0-9_.-]+$/ },
  { method: 'POST', re: /^\/hub\/blocks$/ },
  { method: 'DELETE', re: /^\/hub\/blocks\/[A-Za-z0-9_.-]+$/ },
  { method: 'GET', re: /^\/blocks$/ },
  // Channel archive (operator dm 19/29 — safe delete with member eviction;
  // agora backlog 0090). Owner/operator; hub enforces. Forwards today even
  // where the hub lacks the route (404 handled client-side as "ships with
  // the next hub update") so the UI is wired ahead of the hub verb.
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/archive$/ },
  { method: 'DELETE', re: /^\/channels\/[A-Za-z0-9_.:-]+\/archive$/ },
  // Agent retire (operator dm 15 — neutral decommission, NOT a ban; agora
  // backlog 0089). Operator only; hub enforces + reserves the id forever.
  // GET /agents/retired enumerates the retired list (the un-retire
  // candidate source, agora 0.12.0) — MUST precede the {id}/retire routes
  // conceptually but regexes are exact so order is irrelevant.
  { method: 'GET', re: /^\/agents\/retired$/ },
  { method: 'POST', re: /^\/agents\/[A-Za-z0-9_.-]+\/retire$/ },
  { method: 'DELETE', re: /^\/agents\/[A-Za-z0-9_.-]+\/retire$/ },
  // Hard-delete a retired agent (operator dm 164b, hub 0.12.41): the
  // irreversible cleanup step. MUST come after the /retire routes so the
  // more specific {id}/retire pattern matches first (this bare {id} is the
  // fallthrough). The hub 409s while the agent is still active.
  { method: 'DELETE', re: /^\/agents\/[A-Za-z0-9_.-]+$/ },
  // Message attachments (operator dm 21; agora backlog 0091). UPLOAD is a
  // RAW-BYTES body (not JSON) — carved out of the JSON-only write gate
  // below; FETCH returns BINARY — served through a binary passthrough (not
  // r.text(), which corrupts bytes). Both membership-gated hub-side.
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/attachments$/, upload: true },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/attachments\/[A-Za-z0-9_-]+$/, binary: true },
  // Direct messages (send side; reading rides the dm:* channel routes).
  { method: 'POST', re: /^\/dms\/[A-Za-z0-9_.-]+\/messages$/ },
  // Invite mint (operator /group, agora 0.12.10 parity): owner-only
  // hub-side; the token travels to the invitee via a DM, never a URL.
  { method: 'POST', re: /^\/channels\/[A-Za-z0-9_.:-]+\/invites$/ },
  // One-call group creation (agora dm#43, hub 0.12.29): replaces the
  // 4-call /group macro; older consoles keep the macro as fallback.
  { method: 'POST', re: /^\/groups$/ },
  // Message ratings (agora-0122, hub 0.12.31 — one reputation system):
  // PUT casts/flips the seat's standing ±1, DELETE withdraws. Reads ride
  // the history-row tally decoration, so no GET here.
  { method: 'PUT', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages\/[A-Za-z0-9-]+\/rating$/ },
  { method: 'DELETE', re: /^\/channels\/[A-Za-z0-9_.:-]+\/messages\/[A-Za-z0-9-]+\/rating$/ },
  // Hub delegation (operator dm 154; hub ADR-0004 separable powers): the
  // Members drawer assigns/resigns the operator's delegate. The grant is
  // an OPERATOR act — the hub authorizes by the seat key (this proxy
  // signs as the operator); the public list lets any viewer verify.
  { method: 'GET', re: /^\/delegations$/ },
  { method: 'PUT', re: /^\/admin\/delegation$/ },
  { method: 'DELETE', re: /^\/admin\/delegation\/[A-Za-z0-9_.-]+$/ },
  { method: 'GET', re: /^\/inbox$/ },
  { method: 'POST', re: /^\/inbox\/ack$/ },
  { method: 'GET', re: /^\/presence$/ },
  // Reputation (operator dm 12; agora 0094): per-channel + hub leaderboards,
  // the attributed votes behind one score, and the operator seat's own vote
  // (PUT casts/revises, DELETE withdraws — the hub enforces one live vote
  // per rater/target/axis and refuses self-votes). Read-only surfaces are
  // membership-gated hub-side like every channel read.
  { method: 'GET', re: /^\/reputation$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/reputation$/ },
  { method: 'GET', re: /^\/channels\/[A-Za-z0-9_.:-]+\/reputation\/[A-Za-z0-9_.-]+\/votes$/ },
  { method: 'PUT', re: /^\/channels\/[A-Za-z0-9_.:-]+\/reputation\/[A-Za-z0-9_.-]+$/ },
  { method: 'DELETE', re: /^\/channels\/[A-Za-z0-9_.:-]+\/reputation\/[A-Za-z0-9_.-]+$/ },
];

/**
 * Cross-origin refusal (adversary P0, 2026-07-15): the loopback peer gate
 * defends against REMOTE peers, but the browser itself is a loopback peer —
 * a hostile page the operator visits can fire cross-origin fetches and
 * WebSocket handshakes at this proxy (WS handshakes skip CORS preflight
 * entirely), and the seat key rides server-side. Rule: when the browser
 * declares an Origin, it must match the Host the request was addressed to;
 * absent Origin (curl, scripts, same-origin GET navigations) passes — a
 * browser NEVER omits Origin on cross-origin fetch/WS, so the vector this
 * closes cannot dodge the check.
 */
function origin_allowed(req) {
  const origin = String((req.headers && req.headers.origin) || '').trim();
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const host = String((req.headers && req.headers.host) || '').trim().toLowerCase();
  return Boolean(host) && parsed.host.toLowerCase() === host;
}

function read_seat_key(keys_path, hub_url, seat) {
  // Env override wins (deployments without the operator key store).
  const env_key = String(process.env.ABSTRACTCONTINUUM_HUB_KEY || '').trim();
  if (env_key) return env_key;
  try {
    const store = JSON.parse(readFileSync(keys_path, 'utf8'));
    const entry = store[`${hub_url}::${seat}`];
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return String(entry.api_key || entry.key || '');
  } catch {
    return '';
  }
}

export function createHubProxy(opts) {
  const hub_url = String(opts.hubUrl || '').replace(/\/+$/, '');
  const seat = String(opts.seat || '').trim();
  const keys_path = String(opts.keysPath || '');

  /** Lazily re-read per request: key rotation must not need a restart. */
  function key() {
    return read_seat_key(keys_path, hub_url, seat);
  }

  async function forward(req, res, hub_path, search) {
    // Allowlist matching runs on the DECODED path: the browser client
    // percent-encodes channel names (dm%3Acontinuum--laurent), and the
    // raw-path match refused every dm read with a misleading
    // "outside the allowlist" (operator-hit 2026-07-15). The RAW path is
    // what forwards — decoding is for the gate only, so an encoded "/"
    // or ".." can never smuggle a different route past it.
    let decoded_path = hub_path;
    try {
      decoded_path = decodeURIComponent(hub_path);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_path_encoding' }));
      return;
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(decoded_path) || decoded_path.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_path' }));
      return;
    }
    const route = HUB_ROUTES.find((r) => r.method === req.method && r.re.test(decoded_path));
    if (!route) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'hub_route_not_allowed', detail: `${req.method} ${decoded_path} is outside the Team page allowlist.` }));
      return;
    }
    // Subresource-fetch gate (adversary: zero-click read-receipt forgery).
    // A GET route may reach the hub with SIDE EFFECTS under the operator
    // seat — GET /messages/{id} is the hub's read_message (records a read,
    // unpins criticals). Because CSP is img-src 'self' and the proxy is
    // same-origin, an untrusted message body rendering
    // `![x](/api/hub/.../messages/id)` would auto-fire that GET as an <img>
    // the instant it's viewed. The client sanitizer (neutralize_unsafe_embeds)
    // is the primary defense; this is the server belt: browsers stamp
    // Sec-Fetch-Dest on subresource loads (image/audio/video/…/object/embed),
    // and NONE of our routes are legitimately loaded that way EXCEPT the
    // attachment blob (an actual <img src>). Refuse any other route fired as
    // a non-document/non-empty destination. Absent header (older browsers,
    // curl) passes — the client sanitizer still covers the browser case.
    const dest = String((req.headers && req.headers['sec-fetch-dest']) || '').toLowerCase();
    const is_subresource = dest && dest !== 'empty' && dest !== 'document';
    const is_attachment_blob = /^\/channels\/[A-Za-z0-9_.:-]+\/attachments\/[A-Za-z0-9_-]+$/.test(decoded_path);
    if (is_subresource && !is_attachment_blob) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'hub_subresource_blocked', detail: `Route ${decoded_path} may not be loaded as a "${dest}" subresource (only attachment blobs may).` }));
      return;
    }
    const seat_key = key();
    if (!seat_key && !route.keyless) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'hub_seat_unavailable', detail: `No hub key for seat "${seat}" (${keys_path}); set ABSTRACTCONTINUUM_HUB_KEY or provision the seat.` }));
      return;
    }

    // Buffer the body with a hard cap (adversary #6): the hub caps
    // attachments at 16 MiB and streams with its own running cap; this
    // bounds the proxy's memory too (a same-origin client or a local
    // non-browser caller can't OOM us with an unbounded body). 24 MiB
    // leaves headroom over the 16 MiB file cap for form overhead.
    const MAX_BODY_BYTES = 24 * 1024 * 1024;
    const chunks = [];
    let received = 0;
    for await (const c of req) {
      received += c.length;
      if (received > MAX_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'body_too_large', detail: `Request body exceeds ${MAX_BODY_BYTES} bytes.` }));
        return;
      }
      chunks.push(c);
    }
    const body = chunks.length ? Buffer.concat(chunks) : null;

    // Writes must arrive as declared JSON — EXCEPT the attachment upload,
    // which is a raw-bytes body by contract (agora 0091). The upload route
    // is carved out here and forwards the declared Content-Type verbatim so
    // the hub records the true type; every other write stays JSON-only (the
    // CSRF/simple-request hardening).
    if (body && req.method !== 'GET' && req.method !== 'HEAD' && !route.upload) {
      const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (ctype !== 'application/json') {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'hub_body_not_json', detail: `Write bodies must be application/json (got "${ctype || 'none'}").` }));
        return;
      }
    }

    try {
      // Version handshake (hub 0.12.3 contract; operator dm 147 root fix):
      // a client that identifies itself owns its staleness detection, and
      // the hub stops appending the synthetic stale-client notice to /inbox
      // — that phantom envelope rode a real channel+seq and inflated the
      // console's unread badges (+1 per delivery, "2 unread, there is only
      // one"). The console renders attachments and typed decorations, so it
      // IS a current client; say so on every forwarded request.
      const upstream_headers = {
        'X-Agora-Client': `abstractcontinuum-console/${CONSOLE_VERSION}`,
        ...(seat_key ? { Authorization: `Bearer ${seat_key}` } : {}),
      };
      if (body) {
        // Upload: forward the declared type verbatim (the hub stores it as
        // metadata). Every other write: application/json.
        upstream_headers['Content-Type'] = route.upload ? String(req.headers['content-type'] || 'application/octet-stream') : 'application/json';
      }
      const r = await fetch(`${hub_url}${hub_path}${search || ''}`, {
        method: req.method,
        headers: upstream_headers,
        body: body && req.method !== 'GET' ? body : undefined,
        // Loopback hub: 15s is generous. Without a signal, undici hangs
        // ~300s per request against a wedged hub and the browser's
        // connection pool starves (adversarial F3, dm 99).
        signal: AbortSignal.timeout(15_000),
        // Never follow a hub redirect (adversary b22b19ed P2, SSRF-adjacent):
        // a 3xx on the attachment route would otherwise be chased by undici's
        // default redirect:follow. The proxy is a fixed-target door.
        redirect: 'manual',
      });
      if (route.binary) {
        // Attachment FETCH: pass the bytes through unmodified (r.text()
        // would corrupt binary), and forward the hub's serve-hardening
        // headers verbatim (Content-Disposition:attachment, nosniff,
        // octet-stream-for-active-types) so the browser honors them.
        const buf = Buffer.from(await r.arrayBuffer());
        const ctype = r.headers.get('content-type') || 'application/octet-stream';
        const out_headers = { 'Content-Type': ctype };
        // Belt (adversary b22b19ed): nosniff prevents SNIFFING but not
        // HONORING a declared active type, and forwarding a hub-sent
        // `Content-Disposition: inline` on an active type would let it render
        // as HTML in our origin. Force `attachment` for ANY active type
        // regardless of what the hub sent, and default to attachment when
        // absent — the disposition is only trusted (verbatim) for inert types.
        const base_type = ctype.split(';')[0].trim().toLowerCase();
        const is_active = /html|xml|svg/.test(base_type);
        const cd = r.headers.get('content-disposition');
        out_headers['Content-Disposition'] = is_active ? 'attachment' : cd || 'attachment';
        out_headers['X-Content-Type-Options'] = r.headers.get('x-content-type-options') || 'nosniff';
        res.writeHead(r.status, out_headers);
        res.end(buf);
        return;
      }
      const text = await r.text();
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'hub_unreachable', detail: String(e && e.message ? e.message : e) }));
    }
  }

  return {
    /**
     * WebSocket relay for live updates (operator c2240: "is everything
     * updated in realtime? they need to."). Mount on the server's
     * 'upgrade' event: browser ⇄ this relay ⇄ hub /ws, with the seat key
     * attached SERVER-side (the browser never sees it; EventSource-style
     * token-in-URL is forbidden by the connection contract). Requires
     * the `ws` package; absent, callers keep the 5s polling lane.
     */
    async handleUpgrade(req, socket, head) {
      const url_path = String(req.url || '').split('?')[0];
      if (url_path !== '/api/hub/ws') return false;
      // F7 (dm-99 tail): a raw upgrade socket with NO 'error' listener is a
      // process-killer — a browser abort during the async window below
      // (dynamic import, upstream connect) raises an uncaught exception.
      // Attach the guard BEFORE the first await.
      socket.on('error', () => {
        try { socket.destroy(); } catch { /* already gone */ }
      });
      try {
        // Same unforgeable peer gate as the HTTP surface, PLUS the origin
        // gate — WS handshakes have no CORS preflight, so without it any
        // page the operator visits could open this relay and read/write
        // as the operator seat (adversary P0).
        const peer = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
        const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1' || peer === '';
        const allow_remote = String(process.env.ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE || '').trim() === '1';
        const seat_key = key();
        let WebSocketServer, WebSocket;
        try {
          ({ WebSocketServer, WebSocket } = await import('ws'));
        } catch {
          socket.destroy();
          return true;
        }
        if ((!loopback && !allow_remote) || !seat_key || !origin_allowed(req)) {
          socket.destroy();
          return true;
        }
        // Compression OFF on both legs: a negotiated permessage-deflate on
        // one side of a string-pipe relay ships RSV1 frames the other side
        // never negotiated (live find: browsers/ws clients offer it by
        // default and the pipe corrupts).
        if (!this._wss) this._wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
        const hub_ws_url = hub_url.replace(/^http/, 'ws') + '/ws';
        const upstream = new WebSocket(hub_ws_url, {
          headers: { Authorization: `Bearer ${seat_key}` },
          perMessageDeflate: false,
        });
        // Handshake deadline (F7): a hub that ACCEPTS TCP but never
        // completes the WS handshake would strand the browser socket
        // forever (no 'open', no 'error'). 15s is generous for loopback;
        // on expiry both legs die and the client falls back to polling.
        const handshake_timer = setTimeout(() => {
          try { upstream.terminate(); } catch { /* already gone */ }
          try { socket.destroy(); } catch { /* already gone */ }
        }, 15_000);
        // Browser leg dying during the connect window must reap the
        // upstream (wave adversary P1-1): ws's handleUpgrade returns
        // WITHOUT invoking the callback on a non-readable socket, so an
        // upstream that opens after a browser abort would otherwise live
        // on listener-less, holding a seat-key-authenticated hub
        // connection until hub restart. 'close' fires for orderly aborts
        // too ('error' alone misses them).
        socket.on('close', () => {
          try { upstream.terminate(); } catch { /* already gone */ }
        });
        // Accept the browser only AFTER the hub leg is up: an onopen-lit
        // "live" dot over a dead upstream was a lie (adversary find), and
        // the pending-frame queue becomes unnecessary by construction.
        upstream.on('open', () => {
          clearTimeout(handshake_timer);
          if (socket.destroyed) {
            // Browser gone while the hub leg connected — reap, never
            // hand a dead socket to handleUpgrade (its callback would
            // silently not run and the upstream would leak).
            try { upstream.terminate(); } catch { /* already gone */ }
            return;
          }
          this._wss.handleUpgrade(req, socket, head, (client) => {
            const close_both = () => {
              try { client.close(); } catch { /* already closed */ }
              try { upstream.close(); } catch { /* already closed */ }
            };
            client.on('message', (data) => {
              // Frame-type allowlist (the WS twin of the HTTP route
              // allowlist): the relay is a door, not a tunnel. subscribe/
              // ping are the only frames this UI sends; ack must ride the
              // distinct audited HTTP path (c1696), and post/presence have
              // HTTP routes with their own gates.
              let kind = '';
              try {
                kind = String(JSON.parse(data.toString())?.type || '');
              } catch {
                return; // non-JSON frame — drop
              }
              if (kind !== 'subscribe' && kind !== 'ping') return;
              try { upstream.send(data.toString()); } catch { close_both(); }
            });
            upstream.on('message', (data) => {
              try { client.send(data.toString()); } catch { close_both(); }
            });
            upstream.on('close', close_both);
            upstream.on('error', close_both);
            client.on('close', close_both);
            client.on('error', close_both);
          });
        });
        upstream.on('error', () => {
          // Hub leg failed before accept: refuse the upgrade so the
          // browser falls back to polling honestly.
          clearTimeout(handshake_timer);
          try { socket.destroy(); } catch { /* already gone */ }
        });
      } catch {
        try { socket.destroy(); } catch { /* already gone */ }
      }
      return true;
    },

    /** Returns true when the request was handled. */
    handle(req, res, pathname, search) {
      if (!pathname.startsWith('/api/hub/') && pathname !== '/api/hub/meta') return false;

      // Socket-peer gate (entity's c1768 class, applied at the mount): this
      // proxy authors hub messages AS THE OPERATOR, so a non-loopback peer
      // reaching it could forge the operator's authorship. Gate on the
      // connection's REAL peer (unforgeable), never a client-controlled
      // header. The default 127.0.0.1 bind already prevents remote peers;
      // this is defense-in-depth if HOST is widened deliberately.
      const peer = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
      const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1' || peer === '';
      const allow_remote = String(process.env.ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE || '').trim() === '1';
      if (!loopback && !allow_remote) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'hub_proxy_non_loopback', detail: `Hub proxy refuses non-loopback peer ${peer} (it authors as the operator seat). Set ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE=1 only behind a trusted front.` }));
        return true;
      }
      // Cross-origin browser requests are refused even from loopback: the
      // browser is a loopback peer, and a hostile page can fire simple
      // POSTs (no preflight) at this surface. Origin-vs-Host is the gate.
      if (!origin_allowed(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'hub_proxy_cross_origin', detail: 'Cross-origin requests to the hub proxy are refused (the proxy authors as the operator seat).' }));
        return true;
      }

      if (pathname === '/api/hub/meta') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, hub_url, seat, seat_key_present: Boolean(key()) }));
        return true;
      }
      const hub_path = pathname.slice('/api/hub'.length);
      void forward(req, res, hub_path, search);
      return true;
    },
  };
}
