# Security model

This page is the deep dive behind [SECURITY.md](../SECURITY.md). Read that
first; this page explains the mechanics.

## What this console can do

AbstractContinuum is a **high-trust surface**. Through the gateway it can:

| Surface | Capability | Blast radius |
| --- | --- | --- |
| Services page | start / stop / restart / **redeploy** managed prod and UAT services; set/unset their env vars | full service control on the gateway host |
| Executions + Backlog | run code-executing agents against framework repos; **promote candidate output to prod**; deploy candidates to UAT | writes to production working trees |
| Inbox | read and send email via configured accounts | outbound mail as the configured identity |
| Team page | read and post in agora hub channels and DMs | messages authored as the configured operator seat |

Whoever reaches this UI with a valid session can redeploy services. Deploy
it accordingly: loopback or private networks by default, your own
authenticating reverse proxy for anything broader, and gateway tokens only
for people with deploy rights.

## Defense layers

1. **Gateway authentication** — every API family requires an authenticated
   gateway principal; the app is a client, never a bypass.
2. **App-origin session proxy** (`bin/cli.js`) — the browser never holds the
   gateway token. Sign-in happens server-side; the session id lives in an
   HttpOnly cookie scoped to this app's origin; the proxy strips any
   client-supplied `Authorization`/cookie headers before forwarding.
3. **CSRF** — mutating requests must echo the CSRF token from the
   non-HttpOnly `abstractcontinuum_gateway_csrf` cookie in
   `x-abstractcontinuum-csrf` (or canonical `x-abstract-csrf`); the proxy
   rejects mismatches with 403.
4. **Gateway URL pinning** — browsers cannot redirect the proxy to another
   gateway unless the request comes from loopback or an operator explicitly
   enabled remote config (see [configuration.md](configuration.md)).
5. **Write-only env vars** — the gateway never returns managed env var
   values; the UI can set/unset but never read them back.
6. **Feature gating** — the process manager and exec worker exist only when
   the gateway admin turned them on (the `process_manager` and
   `backlog_exec_runner` settings, off by default; only a gateway admin can
   change them, from Settings → Gateway administration or
   `abstractgateway config set`).
7. **Content-Security-Policy on the app document** — the Team page renders
   untrusted content (hub messages, channel fs files, attachments) as
   markdown. The renderer emits only React elements (no raw-HTML pass, no
   `javascript:` links), and the prod server adds a CSP backstop:
   `img-src 'self' data:` blocks remote-image beacons from untrusted
   markdown, `script-src 'self'` blocks any script injection class,
   `object-src 'none'` and `frame-ancestors 'none'` close embed vectors.
   Inline text previews are size-capped (256 KiB; larger files download)
   so pathological input cannot freeze the tab. Note: the Vite dev server
   (port 3003, developer-only) does not send the CSP header — the operator
   surface is always the prod server on :3002.

## Execution safety model

Executions default to **UAT mode**: the agent works in a candidate
workspace, the operator inspects it on the shared UAT stack, and only an
explicit "Approve → promote to prod" writes to production (with conflict
detection against a diverged prod base). **Inplace mode** edits prod
directly and is labeled dangerous in the UI — use it only when you
understand the risk.

## Residual risks to keep in mind

- Anyone with a session has, transitively, code execution on the gateway
  host (via redeploy of services whose code an execution can change).
  There is no per-page authorization: gateway access = full console.
- The server binds loopback (`127.0.0.1`) by default; binding wider
  (`HOST=0.0.0.0`) is an explicit deployment choice. The hub proxy also
  refuses non-loopback peers unless `ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE=1`,
  and rejects browser requests whose `Origin` does not match the host
  (WebSocket handshakes included). The Vite dev server is deliberately open
  (`allowedHosts: true`) and must never be the production surface.
- The Team page acts as ONE hub seat for everyone who reaches the console:
  the seat key is held server-side, and every message posted from the page
  is authored by that seat.
- Sessions persist for 30 days (the sign-in form always sets
  `persist: true`); sign out explicitly on shared machines.
- The sign-in POST itself carries no CSRF token (login-CSRF class). The
  gateway-URL pinning bounds the damage — a forged login can only create a
  session against the server-pinned gateway — but be aware of it when
  fronting the app with additional auth.
- Actor attribution for high-trust actions (who promoted, who redeployed)
  is the gateway's responsibility; this console does not yet surface an
  audit view. Check the gateway's audit/ledger facilities when you need
  the trail.
- There is no client-side bearer-token mode: the browser talks only to the
  same-origin proxy, which holds credentials in HttpOnly cookies. App
  startup removes any token an older build left in browser storage.
- Email send uses whatever accounts the gateway configured; the console
  does not add its own rate or recipient limits.
