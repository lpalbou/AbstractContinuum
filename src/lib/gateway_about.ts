// Versions for the About dialog (ui-kit 0.7.0 compact About). The gateway's
// public `GET /api/gateway/about` (`{ abstractframework, abstractgateway,
// packages }`) is fetched when the dialog opens; only the framework and
// gateway versions are shown, through the kit's `aboutVersionsFromGateway`
// (never a package list). A failure is shown, never hidden: the gateway
// version reads "unavailable (HTTP <status>: <detail>)" or "(<error>)".
import { aboutVersionsFromGateway, type AfAboutVersions, type GatewayAboutPayload } from "@abstractframework/ui-kit";

import { GatewayRequestError } from "./gateway_client";

export type { AfAboutVersions };

export const GATEWAY_ABOUT_LOADING: AfAboutVersions = { framework: null, gateway: null, gatewayNote: "checking…" };

/** Why `api/gateway/about` could not be read: the HTTP status and detail,
 *  or the network error's message. */
export function gateway_about_error_reason(err: unknown): string {
  if (err instanceof GatewayRequestError) {
    const detail = err.message.replace(/^gateway_about failed:\s*/, "").trim();
    return `HTTP ${err.status}${detail && detail !== String(err.status) ? `: ${detail}` : ""}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg || "request failed";
}

/** Fetch the versions; never throws (the failure becomes the gateway note). */
export async function load_gateway_about_versions(client: { gateway_about(): Promise<any> }): Promise<AfAboutVersions> {
  let body: GatewayAboutPayload;
  try {
    body = await client.gateway_about();
  } catch (err) {
    return aboutVersionsFromGateway(null, gateway_about_error_reason(err));
  }
  return aboutVersionsFromGateway(body);
}
