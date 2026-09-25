// Gateway rows for the About dialog. The versions come from the gateway's
// public `GET /api/gateway/about` (`{ abstractframework, abstractgateway,
// packages }`), fetched when the dialog opens, and are formatted by the kit's
// `gatewayVersionRows` so every app shows the same rows. A failure is shown
// as a row, never hidden: "Gateway: unavailable (HTTP <status>: <detail>)" or
// "(<error>)".
import { gatewayVersionRows, type AboutRow, type GatewayAboutPayload } from "@abstractframework/ui-kit";

import { GatewayRequestError } from "./gateway_client";

export type { AboutRow };

export const GATEWAY_ABOUT_LOADING: AboutRow[] = [["Gateway", "checking…"]];

/** Why `/api/gateway/about` could not be read: the HTTP status and detail,
 *  or the network error's message. */
export function gateway_about_error_reason(err: unknown): string {
  if (err instanceof GatewayRequestError) {
    const detail = err.message.replace(/^gateway_about failed:\s*/, "").trim();
    return `HTTP ${err.status}${detail && detail !== String(err.status) ? `: ${detail}` : ""}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg || "request failed";
}

/** Fetch and format; never throws (the failure becomes the row). */
export async function load_gateway_about_rows(client: { gateway_about(): Promise<any> }): Promise<AboutRow[]> {
  let body: GatewayAboutPayload;
  try {
    body = await client.gateway_about();
  } catch (err) {
    return gatewayVersionRows({ error: gateway_about_error_reason(err) });
  }
  return gatewayVersionRows(body);
}
