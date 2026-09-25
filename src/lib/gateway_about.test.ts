import { describe, expect, it } from "vitest";

import { resolve_app_version } from "../app_version";
import { GatewayRequestError } from "./gateway_client";
import { gateway_about_error_row, gateway_about_rows, load_gateway_about_rows } from "./gateway_about";

describe("gateway_about_rows", () => {
  it("formats gateway, framework and sorted packages", () => {
    expect(
      gateway_about_rows({ abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: { zeta: "1", abstractcore: "2.15.2", abstractgateway: "0.4.3", missing: null } })
    ).toEqual([
      ["Gateway", "AbstractGateway 0.4.3"],
      ["Gateway framework", "AbstractFramework 0.3.3"],
      ["Gateway package abstractcore", "2.15.2"],
      ["Gateway package missing", "not installed"],
      ["Gateway package zeta", "1"],
    ]);
  });

  it("says when the gateway host has no abstractframework install", () => {
    expect(gateway_about_rows({ abstractframework: null, abstractgateway: "0.4.3", packages: {} })).toEqual([
      ["Gateway", "AbstractGateway 0.4.3"],
      ["Gateway framework", "not installed on the gateway"],
    ]);
  });

  it("rejects a body without the gateway version", () => {
    expect(() => gateway_about_rows({ ok: true })).toThrow(/no abstractgateway version/);
    expect(() => gateway_about_rows(null)).toThrow();
  });
});

describe("gateway_about_error_row / load_gateway_about_rows", () => {
  it("names the HTTP status and detail", () => {
    expect(gateway_about_error_row(new GatewayRequestError("gateway_about failed: Unauthorized", 401, null))).toEqual([
      ["Gateway", "unavailable (HTTP 401: Unauthorized)"],
    ]);
    expect(gateway_about_error_row(new GatewayRequestError("gateway_about failed: 502", 502, null))).toEqual([["Gateway", "unavailable (HTTP 502)"]]);
  });

  it("names a network error", () => {
    expect(gateway_about_error_row(new TypeError("Failed to fetch"))).toEqual([["Gateway", "unavailable (Failed to fetch)"]]);
  });

  it("turns failures and bad bodies into the single row, never throws", async () => {
    await expect(load_gateway_about_rows({ gateway_about: async () => { throw new TypeError("Failed to fetch"); } })).resolves.toEqual([
      ["Gateway", "unavailable (Failed to fetch)"],
    ]);
    await expect(load_gateway_about_rows({ gateway_about: async () => ({ ok: true }) })).resolves.toEqual([
      ["Gateway", "unavailable (unexpected response: no abstractgateway version)"],
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
