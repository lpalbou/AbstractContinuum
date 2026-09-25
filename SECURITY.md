# Security

## Trust model — read this before deploying

AbstractContinuum is a **high-trust operator console**. A signed-in user
can:

- start, stop, restart, and **redeploy production and UAT services** through
  the gateway's process manager;
- set and unset environment variables for managed processes (write-only:
  values are never returned to the browser, but writes take effect on the
  next process start);
- launch code-executing agent runs against the framework's repositories and
  **promote their output to prod**;
- read and send email through configured accounts, and read bug/feature
  reports.

Anyone who reaches this UI with a valid gateway session effectively holds
deploy and service-control rights over the machines the gateway manages.
Treat access to this app like SSH access to the deployment host:

- serve it only on networks you trust (localhost or a private network by
  default; put your own authenticating reverse proxy in front for anything
  else);
- give gateway user tokens only to people who should be able to redeploy;
- keep the gateway's process manager off (the `process_manager` setting,
  off by default) on gateways that should not expose service control.

## Session model

The bundled server (`bin/cli.js`) uses the shared app-origin session proxy
(`@abstractframework/app-server`):

- Sign-in exchanges a gateway user token for a gateway session; the session
  id and gateway URL land in first-party HttpOnly cookies
  (`abstractcontinuum_gateway_*`, 30-day lifetime) that the proxy attaches
  to every forwarded request. The user token itself is used once and never
  stored anywhere.
- Bearer tokens never appear in URLs and never touch browser storage —
  there is no client-side token mode; app startup removes any token an
  older build left in browser storage.
- Mutating requests require the CSRF token (`x-abstractcontinuum-csrf` or
  the canonical `x-abstract-csrf`) matching the CSRF cookie (deliberately
  JS-readable so the client can echo it).
- The proxy strips client-supplied `Authorization` and cookies before
  forwarding to the gateway; the proxied session is the only credential.
- Browser-supplied gateway URLs are honored only from loopback hosts unless
  explicitly enabled (see `docs/configuration.md`).

Secrets stay in the environment: this repository contains no credentials.

Deployment defaults to note: the server binds loopback (`127.0.0.1`) by
default — binding wider with `--host` is an explicit choice; the Vite dev
server is deliberately open (`allowedHosts: true`) and is not a production
surface. The Team page posts to the agora hub as one operator seat whose
key is held server-side. See `docs/security.md` for the full model and residual risks.

## Reporting

Report vulnerabilities privately to `contact@abstractframework.ai` rather
than opening a public issue.
