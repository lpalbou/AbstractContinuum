// @vitest-environment jsdom
//
// Plain http from another machine (LAN, Tailscale) is not a secure context:
// the browser withholds crypto.randomUUID, crypto.subtle, navigator.clipboard
// and getUserMedia. These tests run the app's id, hash and copy paths with
// those APIs removed.
import { afterEach, describe, expect, it, vi } from "vitest";

import { turn_hash, type LedgerTurn } from "./hub_ledger";
import { random_id } from "./ids";
import { clipboardWrite, mediaAvailable, MEDIA_NEEDS_HTTPS, sha256Hex } from "./secure-context";
import { sha256_hex } from "../ui/backlog/model";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const realCrypto = globalThis.crypto;

function withoutSecureCrypto(): void {
  // What an http origin exposes: getRandomValues only.
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues: (a: Uint8Array) => realCrypto.getRandomValues(a) },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true, writable: true });
  vi.restoreAllMocks();
});

const TURN: LedgerTurn = {
  id: "01TESTULID0000000000000000",
  seq: 2,
  sender: "continuum",
  kind: "message",
  status: "reply",
  urgency: "inbox",
  critical: 0,
  downgraded: 0,
  to: ["laurent"],
  title: "tëst — unicode ✓",
  body: 'line1\nline2 with "quotes" and emoji 🎉',
  data: { answers: ["1"], nested: { a: [1.5, null, true], z: 1 } },
  reply_to: null,
  created_at: 1783382860.341553,
} as LedgerTurn;
// hub_ledger.test.ts PY_HASH (CPython reference).
const PY_HASH = "e6930975966b3b3c28075f4fda667060fb4f5a0a2fe4b90f1ed54fddb47e5beb";

describe("non-secure context (plain http)", () => {
  it("random_id returns distinct v4 UUIDs without crypto.randomUUID", () => {
    withoutSecureCrypto();
    expect((globalThis.crypto as { randomUUID?: unknown }).randomUUID).toBeUndefined();
    const ids = Array.from({ length: 10000 }, () => random_id());
    expect(ids.every((x) => V4.test(x))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the ledger hash is unchanged without crypto.subtle", async () => {
    withoutSecureCrypto();
    expect(await turn_hash("abc123", TURN, "commons")).toBe(PY_HASH);
  });

  it("the backlog content hash is a real SHA-256 without crypto.subtle", async () => {
    const withSubtle = await sha256_hex("backlog item ✓");
    withoutSecureCrypto();
    const withoutSubtle = await sha256_hex("backlog item ✓");
    expect(withoutSubtle).toMatch(/^[0-9a-f]{64}$/);
    expect(withoutSubtle).toBe(withSubtle);
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("clipboardWrite falls back to execCommand and reports its result", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true, writable: true });
    expect(await clipboardWrite("token-123")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    exec.mockReturnValue(false);
    expect(await clipboardWrite("token-123")).toBe(false);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  it("mediaAvailable is false without getUserMedia and the sentence says why", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(mediaAvailable()).toBe(false);
    // The sentence itself (http: the kit's; secure context: browser lacks it): media_sentence.test.ts.
    expect(MEDIA_NEEDS_HTTPS).toBe("Voice and camera are not supported in this browser (getUserMedia unavailable).");
  });
});
