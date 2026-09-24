import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { createGatewaySessionProxy } from "@abstractframework/app-server";
// Team page hub proxy (operator-seat transport) — same module the prod
// server mounts, so dev and prod serve identical /api/hub/* behavior.
// @ts-expect-error plain-JS module without types
import { createHubProxy } from "./bin/hub_proxy.js";

// Dev-server twin of bin/cli.js: mount the SAME app-origin gateway session
// proxy so sign-in works identically in dev and prod. Without this,
// POST /api/connection/gateway fell through Vite's raw proxy to the gateway,
// which has no such route -> 404 "Not Found" at the sign-in form (maintainer
// incident 2026-07-12).
//
// Fall-through contract: the connection endpoint is always ours; other
// /api/* requests go through the session proxy ONLY when a browser session
// exists (prod parity). With no session they fall through to Vite's raw
// /api proxy below, so no-auth dev gateways keep working unauthenticated.
function gatewaySessionDevProxy(): Plugin {
  const proxy = createGatewaySessionProxy({
    appId: "abstractcontinuum",
    defaultGatewayUrl:
      String(process.env.ABSTRACTCONTINUUM_GATEWAY_URL || process.env.ABSTRACTGATEWAY_URL || "").trim() || "http://127.0.0.1:8080",
  });
  const hub_proxy = createHubProxy({
    hubUrl: String(process.env.ABSTRACTCONTINUUM_HUB_URL || process.env.AGORA_HUB_URL || "http://127.0.0.1:8765").trim().replace(/\/+$/, ""),
    seat: String(process.env.ABSTRACTCONTINUUM_HUB_SEAT || "operator").trim(),
    keysPath: String(process.env.ABSTRACTCONTINUUM_HUB_KEYS || join(homedir(), ".agora", "keys.json")),
  });
  return {
    name: "abstractcontinuum-gateway-session-proxy",
    configureServer(server) {
      // Live hub WebSocket relay (mirrors bin/cli.js). Vite's own HMR
      // websocket rides a different path; only /api/hub/ws is claimed.
      server.httpServer?.on("upgrade", (req, socket, head) => {
        const url_path = String(req.url || "").split("?")[0];
        if (url_path !== "/api/hub/ws") return;
        void (hub_proxy as any).handleUpgrade(req, socket, head);
      });
      server.middlewares.use((req, res, next) => {
        let pathname = "/";
        let search = "";
        try {
          const u = new URL(req.url || "/", "http://local");
          pathname = u.pathname;
          search = u.search;
        } catch {
          next();
          return;
        }
        if (hub_proxy.handle(req, res, pathname, search)) {
          return;
        }
        if (pathname === proxy.connectionPath) {
          proxy.handle(req, res, pathname);
          return;
        }
        if (pathname.startsWith("/api/") && proxy.browserSession(req).sessionId) {
          proxy.handle(req, res, pathname);
          return;
        }
        next();
      });
    },
  };
}

// The kit trees are consumed FROM SOURCE via the aliases below, and their
// tracked compiled twins (src/*.js beside src/*.tsx, NodeNext explicit-.js
// imports) resolve FIRST — so a kit fix in .tsx never reaches this app
// until the uic seat regenerates the twins (stale-twin incident
// 2026-07-16: the shipped "/"-link + connect-modal fixes existed only in
// .ts/.tsx). This plugin redirects any resolved kit src/*.js to its .ts/.tsx
// sibling when one exists — source of truth wins, tracked artifacts don't.
function preferKitTypescriptSources(): Plugin {
  const kit_root = resolve(__dirname, "../abstractuic");
  return {
    name: "abstractcontinuum-prefer-kit-ts",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const id = resolved?.id || "";
      if (!id.startsWith(kit_root) || !id.endsWith(".js")) return resolved;
      const base = id.slice(0, -3);
      for (const ext of [".tsx", ".ts"]) {
        const candidate = base + ext;
        if (existsSync(candidate) && existsSync(dirname(candidate))) return { ...resolved, id: candidate };
      }
      return resolved;
    },
  };
}

export default defineConfig({
  plugins: [preferKitTypescriptSources(), gatewaySessionDevProxy(), react()],
  resolve: {
    alias: [
      { find: "@abstractframework/panel-chat", replacement: resolve(__dirname, "../abstractuic/panel-chat/src") },
      { find: "@abstractframework/ui-kit", replacement: resolve(__dirname, "../abstractuic/ui-kit/src") },
    ],
    // TS sources FIRST (stale-twin incident 2026-07-16): Vite's default
    // order tries .js before .tsx, so a stray compiled twin beside a .tsx
    // source silently shadows every later edit — in OUR src and in the
    // aliased ui-kit/panel-chat trees alike. scripts/clean_stale_js.mjs
    // guards our tree; this ordering covers extensionless imports and the
    // plugin above covers the kit's explicit-.js NodeNext imports.
    extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: false,
    // No cors:true — the session proxy is same-origin; a permissive dev
    // CORS posture would let any origin drive a no-auth dev gateway
    // through the victim's browser (adversarial find, 2026-07-12).
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, "../abstractuic")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        // ws MUST stay off: with ws:true http-proxy registers its own
        // upgrade listener for every /api/* path and races the hub relay
        // on /api/hub/ws — two writers on one socket corrupted frames
        // ("RSV1 must be clear" / Chromium "Invalid frame header", live
        // find 2026-07-15). Gateway streaming is SSE (HTTP), never WS.
        ws: false,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
