import { describe, expect, it, vi } from "vitest";
import { gatewayVersionRows } from "@abstractframework/ui-kit";

import { resolve_app_version } from "../app_version";
import { GatewayRequestError } from "./gateway_client";
import { gateway_about_error_reason, load_gateway_about_rows } from "./gateway_about";

// Wrap the kit's formatter (behaviour unchanged) so the tests can prove the
// gateway rows come from it and not from a local copy.
vi.mock("@abstractframework/ui-kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("@abstractframework/ui-kit")>();
  return { ...kit, gatewayVersionRows: vi.fn(kit.gatewayVersionRows) };
});

function answering(body: any) {
  return { gateway_about: async () => body };
}

function failing(err: unknown) {
  return { gateway_about: async () => { throw err; } };
}

describe("load_gateway_about_rows", () => {
  it("formats gateway, framework and sorted packages with the kit helper", async () => {
    const body = { abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: { zeta: "1", abstractcore: "2.15.2", abstractgateway: "0.4.3", missing: null } };
    vi.mocked(gatewayVersionRows).mockClear();
    await expect(load_gateway_about_rows(answering(body))).resolves.toEqual([
      ["Gateway", "AbstractGateway 0.4.3"],
      ["Gateway framework", "AbstractFramework 0.3.3"],
      ["Gateway package abstractcore", "2.15.2"],
      ["Gateway package zeta", "1"],
    ]);
    expect(vi.mocked(gatewayVersionRows)).toHaveBeenCalledWith(body);
  });

  it("says when the gateway host has no abstractframework install", async () => {
    await expect(load_gateway_about_rows(answering({ abstractframework: null, abstractgateway: "0.4.3", packages: {} }))).resolves.toEqual([
      ["Gateway", "AbstractGateway 0.4.3"],
      ["Gateway framework", "not installed on the gateway host"],
    ]);
  });

  it("reports a body without the gateway version as unavailable", async () => {
    await expect(load_gateway_about_rows(answering({ ok: true }))).resolves.toEqual([
      ["Gateway", "unavailable (the gateway did not report its version)"],
    ]);
    await expect(load_gateway_about_rows(answering(null))).resolves.toEqual([
      ["Gateway", "unavailable (the gateway did not report its version)"],
    ]);
  });

  it("names the HTTP status and detail in the single failure row", async () => {
    vi.mocked(gatewayVersionRows).mockClear();
    await expect(load_gateway_about_rows(failing(new GatewayRequestError("gateway_about failed: Unauthorized", 401, null)))).resolves.toEqual([
      ["Gateway", "unavailable (HTTP 401: Unauthorized)"],
    ]);
    expect(vi.mocked(gatewayVersionRows)).toHaveBeenCalledWith(null, "HTTP 401: Unauthorized");
    expect(gateway_about_error_reason(new GatewayRequestError("gateway_about failed: 502", 502, null))).toBe("HTTP 502");
  });

  it("names a network error, never throws", async () => {
    await expect(load_gateway_about_rows(failing(new TypeError("Failed to fetch")))).resolves.toEqual([
      ["Gateway", "unavailable (Failed to fetch)"],
    ]);
  });
});

describe("resolve_app_version", () => {
  it("accepts the build constant and refuses a missing one", () => {
    expect(resolve_app_version(" 1.2.3 ")).toBe("1.2.3");
    expect(() => resolve_app_version(undefined)).toThrow(/__APP_VERSION__/);
    expect(() => resolve_app_version("")).toThrow(/__APP_VERSION__/);
  });
});
