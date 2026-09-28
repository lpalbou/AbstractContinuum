// Gateway API paths are RELATIVE: with the same-origin base ("") a request
// resolves under the page's <base href> (`/` standalone, `/apps/continuum/`
// behind the gateway); an explicit base prefixes it with one "/".
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "./gateway_client";

afterEach(() => vi.unstubAllGlobals());

function capture(): string[] {
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    })
  );
  return seen;
}

describe("GatewayClient request URLs", () => {
  it("same origin: a relative api/gateway/… path (never rooted at the host)", async () => {
    const seen = capture();
    await new GatewayClient({ base_url: "" }).gateway_about();
    await new GatewayClient({ base_url: "" }).list_processes();
    expect(seen).toEqual(["api/gateway/about", "api/gateway/processes"]);
  });

  it("an explicit base: <base>/api/gateway/… (trailing slashes folded)", async () => {
    const seen = capture();
    await new GatewayClient({ base_url: "http://gw.example:8080/" }).gateway_about();
    expect(seen).toEqual(["http://gw.example:8080/api/gateway/about"]);
  });
});
