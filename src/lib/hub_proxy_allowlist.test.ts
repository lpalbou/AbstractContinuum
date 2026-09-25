// Allowlist pins for the hub proxy gate (bin/hub_proxy.js).
//
// The regression this file exists for: the browser percent-encodes channel
// names, so GET /channels/dm%3Acontinuum--laurent/messages arrived with an
// encoded ":" and the RAW-path regex match refused every direct-message
// read as "outside the Team page allowlist" (operator-hit 2026-07-15).
// The gate now matches the DECODED path while the raw path forwards.
import { describe, expect, it } from "vitest";
// @ts-expect-error plain-JS module without types
import { createHubProxy } from "../../bin/hub_proxy.js";

type Captured = { status: number; body: string };

/** Minimal req/res doubles for the proxy's node-http surface. */
function fake_req(method: string, url: string, headers?: Record<string, string>, body?: string): any {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method,
    url,
    headers: { host: "127.0.0.1:3002", ...(headers || {}) },
    socket: { remoteAddress: "127.0.0.1" },
    // forward() drains the body with `for await` — yield the (optional) body.
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

function fake_res(done: (c: Captured) => void): any {
  let status = 0;
  return {
    writeHead(code: number) {
      status = code;
    },
    end(body?: string) {
      done({ status, body: String(body || "") });
    },
  };
}

function proxy_for_test() {
  return createHubProxy({
    // Unreachable hub: an ALLOWED route ends 502 (fetch refused), a
    // refused route ends 403/400 without ever dialing out — the status
    // separates gate decisions from transport.
    hubUrl: "http://127.0.0.1:1",
    seat: "test-seat",
    keysPath: "/nonexistent/keys.json",
    token: "test-key",
  });
}

async function run(method: string, pathname: string, headers?: Record<string, string>, body?: string, search = ""): Promise<Captured> {
  const proxy = proxy_for_test();
  return await new Promise<Captured>((resolve) => {
    // cli.js splits req.url into (pathname, search) before handle() — the
    // allowlist matches the query-less pathname, the search only forwards.
    const handled = proxy.handle(fake_req(method, pathname + search, headers, body), fake_res(resolve), pathname, search);
    if (!handled) resolve({ status: -1, body: "unhandled" });
  });
}

describe("hub proxy allowlist (decoded-path gate)", () => {
  it("admits percent-encoded dm channel reads (the operator regression)", async () => {
    const r = await run("GET", "/api/hub/channels/dm%3Acontinuum--laurent/messages");
    expect(r.status).toBe(502); // allowlisted → forwarded → hub unreachable
  });

  it("admits literal dm channel reads", async () => {
    const r = await run("GET", "/api/hub/channels/dm:continuum--laurent/messages");
    expect(r.status).toBe(502);
  });

  it("refuses encoded traversal attempts before any forward", async () => {
    const r = await run("GET", "/api/hub/channels/..%2F..%2Fadmin/messages");
    expect([400, 403]).toContain(r.status);
    expect(r.status).not.toBe(502);
  });

  it("refuses routes outside the allowlist", async () => {
    const r = await run("DELETE", "/api/hub/channels/commons/messages");
    expect(r.status).toBe(403);
  });

  it("blocks a side-effecting GET fired as an <img> subresource (zero-click read-receipt forgery)", async () => {
    // read_message (GET /messages/{id}) records a read under the operator
    // seat; an <img> smuggle would auto-fire it. Sec-Fetch-Dest=image → 403.
    const r = await run("GET", "/api/hub/channels/commons/messages/01ABC", { "sec-fetch-dest": "image" });
    expect(r.status).toBe(403);
    expect(r.body).toContain("hub_subresource_blocked");
  });

  it("still serves an attachment blob as an <img> subresource (the ONE legit image load)", async () => {
    const r = await run("GET", "/api/hub/channels/commons/attachments/sha256abc", { "sec-fetch-dest": "image" });
    expect(r.status).toBe(502); // allowlisted + image-legit → forwarded → hub unreachable in test
  });

  it("allows the same GET as a normal fetch (Sec-Fetch-Dest=empty)", async () => {
    const r = await run("GET", "/api/hub/channels/commons/messages/01ABC", { "sec-fetch-dest": "empty" });
    expect(r.status).toBe(502); // allowlisted → forwarded
  });

  it("refuses malformed percent-encoding loudly", async () => {
    const r = await run("GET", "/api/hub/channels/%zz/messages");
    expect(r.status).toBe(400);
  });
});

describe("hub proxy origin gate (browser cross-origin refusal)", () => {
  // The seat key rides server-side, so a hostile page the operator visits
  // must never be able to drive this surface. Browsers ALWAYS send Origin
  // on cross-origin fetch/WS; Origin-vs-Host is the whole gate.
  it("refuses a cross-origin browser request", async () => {
    const r = await run("GET", "/api/hub/channels", { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.body).toContain("hub_proxy_cross_origin");
  });

  it("admits a same-origin browser request", async () => {
    const r = await run("GET", "/api/hub/channels", { origin: "http://127.0.0.1:3002" });
    expect(r.status).toBe(502); // past the gate → forwarded → unreachable hub
  });

  it("admits origin-less non-browser clients (curl, scripts)", async () => {
    const r = await run("GET", "/api/hub/channels");
    expect(r.status).toBe(502);
  });

  it("refuses an unparseable origin", async () => {
    const r = await run("GET", "/api/hub/channels", { origin: "not a url" });
    expect(r.status).toBe(403);
  });
});

describe("hub proxy attachment routes (agora 0091)", () => {
  // The upload is a RAW-BYTES body — it must be carved out of the JSON-only
  // write gate (otherwise a 415), while every OTHER write stays JSON-only.
  it("lets the raw-bytes attachment upload through the JSON-only gate", async () => {
    const r = await run("POST", "/api/hub/channels/commons/attachments", { "content-type": "image/png" }, "\x89PNG\r\n");
    expect(r.status).toBe(502); // past the gate → forwarded → hub unreachable
    expect(r.status).not.toBe(415);
  });

  it("still refuses a non-JSON body on a NORMAL write route (gate intact)", async () => {
    const r = await run("POST", "/api/hub/channels/commons/messages", { "content-type": "text/plain" }, "hello");
    expect(r.status).toBe(415);
  });

  it("allowlists the binary attachment fetch route", async () => {
    const r = await run("GET", "/api/hub/channels/commons/attachments/abc123");
    expect(r.status).toBe(502); // allowlisted → forwarded → unreachable
  });
});

describe("hub proxy reputation routes (agora 0094)", () => {
  const JSON_H = { "content-type": "application/json" };
  it("allowlists the hub-wide and per-channel boards + the votes read", async () => {
    expect((await run("GET", "/api/hub/reputation")).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/reputation")).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/reputation/observer/votes")).status).toBe(502);
  });

  it("allowlists cast (PUT) and withdraw (DELETE) of the seat's own vote", async () => {
    expect((await run("PUT", "/api/hub/channels/commons/reputation/observer", JSON_H, JSON.stringify({ axis: "trust", value: 1 }))).status).toBe(502);
    // The withdraw carries its axis as a QUERY (client _delete_reputation) —
    // the gate must match the pathname alone, with the search forwarding.
    expect((await run("DELETE", "/api/hub/channels/commons/reputation/observer", undefined, undefined, "?axis=trust")).status).toBe(502);
  });

  it("refuses an off-allowlist reputation write (POST is not a verb here)", async () => {
    expect((await run("POST", "/api/hub/channels/commons/reputation/observer", JSON_H, JSON.stringify({}))).status).toBe(403);
  });
});

describe("hub proxy fs read charset (dm 93: listed files must be clickable)", () => {
  it("passes hub-legal paths the old charset 403'd (spaces, unicode, +, @)", async () => {
    expect((await run("GET", "/api/hub/channels/commons/fs/notes/meeting notes.md")).status).toBe(502);
    expect((await run("GET", encodeURI("/api/hub/channels/commons/fs/résumé.md"))).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/fs/a+b/x.md")).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/fs/n@e/x.md")).status).toBe(502);
  });

  it("still refuses dot-segments and backslashes (any refusal code — never forwarded)", async () => {
    // Dot-segments may be rejected by an earlier proxy guard (400) or the
    // allowlist (403) — both DENY; the pin is that none reaches the hub (502).
    for (const p of ["/api/hub/channels/commons/fs/../secrets", "/api/hub/channels/commons/fs/a/../b.md", "/api/hub/channels/commons/fs/a\\b.md"]) {
      const status = (await run("GET", p)).status;
      expect([400, 403]).toContain(status);
    }
  });
});

describe("hub proxy S3 join routes (store read-only + work index)", () => {
  it("allowlists the store keys list and single-key reads (claim:/decision: rows)", async () => {
    expect((await run("GET", "/api/hub/channels/commons/store")).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/store/claim:agora-0093")).status).toBe(502);
    expect((await run("GET", "/api/hub/channels/commons/store/decision:work-item-vocabulary")).status).toBe(502);
  });

  it("keeps the store WRITE surface at channel:meta ONLY — reactions:* writes are CLOSED (dm 150 one-system ruling)", async () => {
    const JSON_H = { "content-type": "application/json" };
    expect((await run("PUT", "/api/hub/channels/commons/store/channel:meta", JSON_H, "{}")).status).toBe(502);
    // The stranding machine is structurally dead: a reactions:* write can
    // never leave this surface again (votes go through the rating verbs).
    expect((await run("PUT", "/api/hub/channels/dm:continuum--laurent/store/reactions:01KXSWG4VVNBXJBGMKQMQ4S10S", JSON_H, "{}")).status).toBe(403);
    expect((await run("PUT", "/api/hub/channels/commons/store/claim:agora-0093", JSON_H, "{}")).status).toBe(403);
    expect((await run("PUT", "/api/hub/channels/commons/store/reactions:", JSON_H, "{}")).status).toBe(403);
    expect((await run("DELETE", "/api/hub/channels/commons/store/claim:agora-0093")).status).toBe(403);
  });

  it("allowlists hard-delete of a retired agent (operator dm 164b), retire routes still match first", async () => {
    // The bare {id} DELETE must not shadow {id}/retire.
    expect((await run("DELETE", "/api/hub/agents/spammer/retire")).status).toBe(502);
    expect((await run("DELETE", "/api/hub/agents/spammer")).status).toBe(502);
    // Not a POST target (retire is the POST; delete is DELETE-only).
    expect((await run("POST", "/api/hub/agents/spammer", { "content-type": "application/json" }, "{}")).status).toBe(403);
  });

  it("allowlists the owed report (comms-audit ask 2): GET /owed for the to_consume rail", async () => {
    expect((await run("GET", "/api/hub/owed")).status).toBe(502);
    // Not a write surface.
    expect((await run("PUT", "/api/hub/owed", { "content-type": "application/json" }, "{}")).status).toBe(403);
  });

  it("allowlists hub delegation (operator dm 154): public list + operator grant/revoke", async () => {
    const JSON_H = { "content-type": "application/json" };
    expect((await run("GET", "/api/hub/delegations")).status).toBe(502);
    expect((await run("PUT", "/api/hub/admin/delegation", JSON_H, "{}")).status).toBe(502);
    expect((await run("DELETE", "/api/hub/admin/delegation/framework")).status).toBe(502);
    // No other admin surface leaks through this door.
    expect((await run("GET", "/api/hub/admin/delegations")).status).toBe(403);
    expect((await run("PUT", "/api/hub/admin/pause", JSON_H, "{}")).status).toBe(403);
  });

  it("allowlists the unified-backlog list (agora c3345, 0.12.19)", async () => {
    expect((await run("GET", "/api/hub/channels/commons/work")).status).toBe(502);
    expect((await run("POST", "/api/hub/channels/commons/work", { "content-type": "application/json" }, "{}")).status).toBe(403);
  });

  it("allowlists the work-id activity index (agora 0093)", async () => {
    expect((await run("GET", "/api/hub/work/abstractframework-0017")).status).toBe(502);
    expect((await run("POST", "/api/hub/work/abstractframework-0017", { "content-type": "application/json" }, "{}")).status).toBe(403);
  });
});

describe("hub proxy /group routes (invite mint)", () => {
  const JSON_H = { "content-type": "application/json" };
  it("allowlists the invite mint POST (owner-only hub-side)", async () => {
    expect((await run("POST", "/api/hub/channels/fix-voice/invites", JSON_H, JSON.stringify({ agent_id: "gateway" }))).status).toBe(502);
  });

  it("allows the one-call group create (agora dm#43, hub 0.12.29)", async () => {
    // 502 = passed the allowlist, refused only by the absent hub.
    expect((await run("POST", "/api/hub/groups", JSON_H, JSON.stringify({ name: "g", members: ["x"], purpose: "p" }))).status).toBe(502);
    expect((await run("GET", "/api/hub/groups")).status).toBe(403);
    expect((await run("DELETE", "/api/hub/groups")).status).toBe(403);
  });

  it("refuses invite reads/deletes — only the mint is on this surface", async () => {
    expect((await run("GET", "/api/hub/channels/fix-voice/invites")).status).toBe(403);
    expect((await run("DELETE", "/api/hub/channels/fix-voice/invites")).status).toBe(403);
  });
});

describe("hub proxy lifecycle routes (agora 0089/0090)", () => {
  const JSON_H = { "content-type": "application/json" };
  it("allowlists channel archive + unarchive", async () => {
    expect((await run("POST", "/api/hub/channels/playground/archive", JSON_H, JSON.stringify({}))).status).toBe(502);
    expect((await run("DELETE", "/api/hub/channels/playground/archive")).status).toBe(502);
  });

  it("allowlists agent retire + unretire + retired-list", async () => {
    expect((await run("POST", "/api/hub/agents/oldbot/retire", JSON_H, JSON.stringify({}))).status).toBe(502);
    expect((await run("DELETE", "/api/hub/agents/oldbot/retire")).status).toBe(502);
    expect((await run("GET", "/api/hub/agents/retired")).status).toBe(502);
  });

  it("refuses an off-allowlist agent route", async () => {
    // DELETE /agents/{id} is now the hard-delete verb (dm 164b) — so the
    // off-allowlist example is a method the agent surface never exposes.
    expect((await run("GET", "/api/hub/agents/oldbot")).status).toBe(403);
    expect((await run("PATCH", "/api/hub/agents/oldbot")).status).toBe(403);
  });
});
