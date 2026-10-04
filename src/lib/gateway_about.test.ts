import { describe, expect, it, vi } from "vitest";
import { aboutVersionsFromGateway } from "@abstractframework/ui-kit";

import { resolve_app_version } from "../app_version";
import { GatewayRequestError } from "./gateway_client";
import { GATEWAY_ABOUT_LOADING, gateway_about_error_reason, load_gateway_about_versions } from "./gateway_about";

// Wrap the kit's helper (behaviour unchanged) so the tests can prove the
// versions come from it and not from a local copy.
vi.mock("@abstractframework/ui-kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("@abstractframework/ui-kit")>();
  return { ...kit, aboutVersionsFromGateway: vi.fn(kit.aboutVersionsFromGateway) };
});

function answering(body: any) {
  return { gateway_about: async () => body };
}

function failing(err: unknown) {
  return { gateway_about: async () => { throw err; } };
}

describe("load_gateway_about_versions", () => {
  it("takes ONLY the framework and gateway versions, through the kit helper (no package list)", async () => {
    const body = { abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: { zeta: "1", abstractcore: "2.15.2", abstractgateway: "0.4.3", missing: null } };
    vi.mocked(aboutVersionsFromGateway).mockClear();
    const versions = await load_gateway_about_versions(answering(body));
    expect(versions).toEqual({ framework: "0.3.3", gateway: "0.4.3" });
    expect(JSON.stringify(versions)).not.toContain("2.15.2");
    expect(vi.mocked(aboutVersionsFromGateway)).toHaveBeenCalledWith(body);
  });

  it("says when the gateway host has no abstractframework install", async () => {
    await expect(load_gateway_about_versions(answering({ abstractframework: null, abstractgateway: "0.4.3", packages: {} }))).resolves.toEqual({
      framework: null,
      gateway: "0.4.3",
      frameworkNote: "not installed on the gateway host",
    });
  });

  it("reports a body without the gateway version as unavailable", async () => {
    const want = { framework: null, gateway: null, gatewayNote: "unavailable (the gateway did not report its version)" };
    await expect(load_gateway_about_versions(answering({ ok: true }))).resolves.toEqual(want);
    await expect(load_gateway_about_versions(answering(null))).resolves.toEqual(want);
  });

  it("names the HTTP status and detail in the gateway note", async () => {
    vi.mocked(aboutVersionsFromGateway).mockClear();
    await expect(load_gateway_about_versions(failing(new GatewayRequestError("gateway_about failed: Unauthorized", 401, null)))).resolves.toEqual({
      framework: null,
      gateway: null,
      gatewayNote: "unavailable (HTTP 401: Unauthorized)",
    });
    expect(vi.mocked(aboutVersionsFromGateway)).toHaveBeenCalledWith(null, "HTTP 401: Unauthorized");
    expect(gateway_about_error_reason(new GatewayRequestError("gateway_about failed: 502", 502, null))).toBe("HTTP 502");
  });

  it("names a network error, never throws", async () => {
    await expect(load_gateway_about_versions(failing(new TypeError("Failed to fetch")))).resolves.toEqual({
      framework: null,
      gateway: null,
      gatewayNote: "unavailable (Failed to fetch)",
    });
  });

  it("shows 'checking…' while loading", () => {
    expect(GATEWAY_ABOUT_LOADING).toEqual({ framework: null, gateway: null, gatewayNote: "checking…" });
  });
});

describe("resolve_app_version", () => {
  it("accepts the build constant and refuses a missing one", () => {
    expect(resolve_app_version(" 1.2.3 ")).toBe("1.2.3");
    expect(() => resolve_app_version(undefined)).toThrow(/__APP_VERSION__/);
    expect(() => resolve_app_version("")).toThrow(/__APP_VERSION__/);
  });
});
