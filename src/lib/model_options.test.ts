import { describe, expect, it, vi } from "vitest";
import { sendable_reasoning } from "./model_options";

// Operator rule 2026-11-07: a saved reasoning level the current model cannot use is never sent.
describe("sendable_reasoning (maintenance AI calls)", () => {
  const gw = (caps: unknown) => ({ discovery_model_capabilities: vi.fn(async () => caps) }) as any;
  it("sends a level the model advertises", async () => {
    const g = gw({ capabilities: { thinking_support: true, reasoning_levels: ["low", "high"] } });
    expect(await sendable_reasoning(g, "lmstudio", "qwen3", "high")).toBe("high");
    expect(g.discovery_model_capabilities).toHaveBeenCalledWith("qwen3", "lmstudio");
  });
  it("drops a level the model does not advertise, or any level for a model that does not reason", async () => {
    expect(await sendable_reasoning(gw({ capabilities: { reasoning_levels: ["low"] } }), "p", "m", "xhigh")).toBeNull();
    expect(await sendable_reasoning(gw({ capabilities: { thinking_support: false } }), "p", "m", "high")).toBeNull();
  });
  it("sends nothing on the gateway default (Settings offers reasoning only with a chosen model)", async () => {
    const g = gw({});
    expect(await sendable_reasoning(g, "", "", "high")).toBeNull();
    expect(g.discovery_model_capabilities).not.toHaveBeenCalled();
  });
  it("costs no request when no level is set; unknown facts keep the level", async () => {
    const g = gw({ capabilities: {} });
    expect(await sendable_reasoning(g, "p", "m", "")).toBeNull();
    expect(g.discovery_model_capabilities).not.toHaveBeenCalled();
    expect(await sendable_reasoning(g, "p", "m", "high")).toBe("high");
  });
});
