// 429 auth-lockout courtesy pins (GatewayClient, incident 2026-07-15).
//
// The gateway's lockout keys on client IP, so every localhost app shares
// ONE bucket — a poller that keeps firing during a 429 keeps the window
// warm for the whole fleet. The client opens a stand-down window on 429
// (ladder 15/30/60/120s) that pollers check via is_backing_off(); a first
// success resets it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "./gateway_client";

function json_response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GatewayClient 429 stand-down courtesy", () => {
  let client: GatewayClient;

  beforeEach(() => {
    client = new GatewayClient({ base_url: "" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T18:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is not backing off before any request", () => {
    expect(client.is_backing_off()).toBe(false);
    expect(client.backoff_until()).toBe(0);
  });

  it("opens a 15s window on the first 429 and clears when it passes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json_response(429, { detail: "Too Many Requests (auth lockout)" })));
    await expect(client.list_processes()).rejects.toThrow();
    expect(client.is_backing_off()).toBe(true);
    // First rung of the ladder is 15s.
    expect(client.backoff_until()).toBe(Date.now() + 15_000);
    vi.advanceTimersByTime(15_000);
    expect(client.is_backing_off()).toBe(false);
  });

  it("escalates 15 → 30 → 60 → 120 on consecutive 429s and caps at 120", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json_response(429, { detail: "too many requests" })));
    const expected = [15_000, 30_000, 60_000, 120_000, 120_000];
    for (const ms of expected) {
      const at = Date.now();
      await expect(client.list_processes()).rejects.toThrow();
      expect(client.backoff_until()).toBe(at + ms);
      // Let each window pass so the next call is a fresh attempt, not a skip.
      vi.advanceTimersByTime(ms);
    }
  });

  it("resets the ladder on the first success", async () => {
    const fetch_mock = vi
      .fn()
      .mockResolvedValueOnce(json_response(429, { detail: "locked" })) // step → 30s next
      .mockResolvedValueOnce(json_response(429, { detail: "locked" })) // 30s window
      .mockResolvedValueOnce(json_response(200, { processes: [] })) // success resets
      .mockResolvedValueOnce(json_response(429, { detail: "locked" })); // back to 15s
    vi.stubGlobal("fetch", fetch_mock);

    await expect(client.list_processes()).rejects.toThrow();
    expect(client.backoff_until()).toBe(Date.now() + 15_000);
    vi.advanceTimersByTime(15_000);

    await expect(client.list_processes()).rejects.toThrow();
    expect(client.backoff_until()).toBe(Date.now() + 30_000);
    vi.advanceTimersByTime(30_000);

    await client.list_processes(); // success
    expect(client.is_backing_off()).toBe(false);

    // Ladder reset: the next 429 is the first rung again, not 60s.
    await expect(client.list_processes()).rejects.toThrow();
    expect(client.backoff_until()).toBe(Date.now() + 15_000);
  });

  it("a non-lockout error (500) does not open a stand-down window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json_response(500, { detail: "boom" })));
    await expect(client.list_processes()).rejects.toThrow();
    expect(client.is_backing_off()).toBe(false);
  });
});
