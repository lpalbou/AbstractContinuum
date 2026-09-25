// Gateway rows for the About dialog. The versions come from the gateway's
// public `GET /about` (`{ abstractframework, abstractgateway, packages }`),
// fetched when the dialog opens. A failure is shown as a row, never hidden:
// "Gateway: unavailable (HTTP <status>: <detail>)" or "(<error>)".
import { GatewayRequestError } from "./gateway_client";

export type AboutRow = [string, string];

export const GATEWAY_ABOUT_LOADING: AboutRow[] = [["Gateway", "checking…"]];

/** Rows for a successful `/about` answer. Throws on a body that does not
 *  carry the gateway version (a different route answered, or a gateway
 *  without the route behind a catch-all). */
export function gateway_about_rows(body: unknown): AboutRow[] {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const gateway = typeof b?.abstractgateway === "string" ? b.abstractgateway.trim() : "";
  if (!gateway) throw new Error("unexpected response: no abstractgateway version");
  const framework = typeof b?.abstractframework === "string" ? b.abstractframework.trim() : "";
  const rows: AboutRow[] = [
    ["Gateway", `AbstractGateway ${gateway}`],
    ["Gateway framework", framework ? `AbstractFramework ${framework}` : "not installed on the gateway"],
  ];
  const packages = b?.packages && typeof b.packages === "object" ? (b.packages as Record<string, unknown>) : {};
  for (const name of Object.keys(packages).sort()) {
    if (name === "abstractgateway" || name === "abstractframework") continue;
    const v = packages[name];
    rows.push([`Gateway package ${name}`, v === null || v === undefined || v === "" ? "not installed" : String(v)]);
  }
  return rows;
}

/** The single row shown when `/about` could not be read. */
export function gateway_about_error_row(err: unknown): AboutRow[] {
  if (err instanceof GatewayRequestError) {
    const detail = err.message.replace(/^gateway_about failed:\s*/, "").trim();
    return [["Gateway", `unavailable (HTTP ${err.status}${detail && detail !== String(err.status) ? `: ${detail}` : ""})`]];
  }
  const msg = err instanceof Error ? err.message : String(err);
  return [["Gateway", `unavailable (${msg || "request failed"})`]];
}

/** Fetch and format; never throws (the failure becomes the row). */
export async function load_gateway_about_rows(client: { gateway_about(): Promise<any> }): Promise<AboutRow[]> {
  try {
    return gateway_about_rows(await client.gateway_about());
  } catch (err) {
    return gateway_about_error_row(err);
  }
}
