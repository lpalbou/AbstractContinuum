// The reasoning level a maintenance AI call may carry (operator rule 2026-11-07): only what the
// chosen model's capability card allows (the kit's resolveSendableModelOptions). On the gateway
// default nothing is sent (Settings offers reasoning only together with a chosen model).
import { resolveSendableModelOptions } from "@abstractframework/ui-kit";
import type { GatewayClient } from "./gateway_client";

export async function sendable_reasoning(
  gateway: Pick<GatewayClient, "discovery_model_capabilities">,
  provider: string | undefined,
  model: string | undefined,
  reasoning: string | undefined,
): Promise<string | null> {
  const p = String(provider || "").trim();
  const m = String(model || "").trim();
  if (!p || !m) return null;
  const options = await resolveSendableModelOptions({ reasoning }, () => gateway.discovery_model_capabilities(m, p));
  return options.reasoning || null;
}
