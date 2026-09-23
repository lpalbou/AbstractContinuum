// @vitest-environment node
//
// Pins for the independent ledger verifier. The load-bearing test is the
// CROSS-LANGUAGE PARITY vector: the expected payload + hash below were
// computed by CPython (json.dumps sort_keys/compact/ensure_ascii +
// hashlib.sha256) over the same turn — if our canonicalization drifts a
// byte from the reference verifier's, this fails.
import { describe, expect, it } from "vitest";

import { canonical_json, py_float_repr, turn_hash, verify_ledger, CanonicalFloat, type LedgerTurn } from "./hub_ledger";

const PARITY_TURN: LedgerTurn = {
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
  data: { answers: ["1"], nested: { z: 1, a: [1.5, null, true] } },
  reply_to: null,
  created_at: 1783382860.341553,
  hash: null,
};

// Computed by python3 (2026-07-14): json.dumps(fields, sort_keys=True,
// separators=(",",":"), ensure_ascii=True) with channel="commons".
const PY_PAYLOAD =
  '{"body":"line1\\nline2 with \\"quotes\\" and emoji \\ud83c\\udf89","channel":"commons","created_at":1783382860.341553,"critical":0,"data":{"answers":["1"],"nested":{"a":[1.5,null,true],"z":1}},"downgraded":0,"id":"01TESTULID0000000000000000","kind":"message","reply_to":null,"sender":"continuum","seq":2,"status":"reply","title":"t\\u00ebst \\u2014 unicode \\u2713","to":["laurent"],"urgency":"inbox"}';
const PY_HASH = "e6930975966b3b3c28075f4fda667060fb4f5a0a2fe4b90f1ed54fddb47e5beb";

function payload_of(turn: LedgerTurn, channel: string): string {
  const fields: Record<string, unknown> = {
    id: turn.id, seq: turn.seq, sender: turn.sender, kind: turn.kind,
    status: turn.status, urgency: turn.urgency, critical: turn.critical,
    downgraded: turn.downgraded, to: turn.to, title: turn.title,
    body: turn.body, data: turn.data, reply_to: turn.reply_to,
    created_at: turn.created_at, channel,
  };
  return canonical_json(fields);
}

describe("hub_ledger canonicalization (cross-language parity)", () => {
  it("produces byte-identical canonical JSON to CPython's json.dumps", () => {
    expect(payload_of(PARITY_TURN, "commons")).toBe(PY_PAYLOAD);
  });

  it("produces the same sha256 turn hash as the Python reference", async () => {
    expect(await turn_hash("abc123", PARITY_TURN, "commons")).toBe(PY_HASH);
  });
});

// Agora parity spine (agora dm#48, agorahub 0.12.30): the frozen
// canonicalization.json golden vector — the byte rules a re-implementing
// verifier MUST reproduce. Vendored inline (self-contained like PY_HASH
// above); source: a2a tests/vectors/canonicalization.json. The
// integral-float case (created_at:2.0 → "2.0") is the highest-severity
// cross-language drift continuum found — Python repr keeps ".0", ECMA-262
// String() drops it — and is now fixed by CanonicalFloat + py_float_repr.
async function sha256_of(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("canonicalization.json golden vector (agora parity spine)", () => {
  // Each case: the TS payload with FLOAT-typed values wrapped (JSON.parse
  // collapses float-ness; the ledger reconstructs it — created_at wrap),
  // the exact canonical string, and sha256(("" + "\n" + canonical)).
  const cases: Array<{ why: string; payload: unknown; canonical: string; sha256: string }> = [
    {
      why: "integral floats keep .0 (the live Python/JS divergence)",
      payload: { created_at: new CanonicalFloat(2.0), seq: 1, body: "x" },
      canonical: '{"body":"x","created_at":2.0,"seq":1}',
      sha256: "12b0c0cb42b8521a588397514a4635ca48dbff619e6f4637e70be95b48cee5a9",
    },
    {
      why: "small magnitudes use zero-padded exponents, not decimal expansion",
      payload: { v: new CanonicalFloat(1e-7) },
      canonical: '{"v":1e-07}',
      sha256: "8eb2adb3e7840964f4f4e1bb564f7737f5f9a5a1813f6f394ffde85beb55f841",
    },
    {
      why: "large magnitudes switch to exponent at 1e+16",
      payload: { v: new CanonicalFloat(1e16) },
      canonical: '{"v":1e+16}',
      sha256: "71027c43c6388cbc3ed1463e2cee29ee33aca97b4dfabb33ac3a393626831f24",
    },
    {
      why: "-0.0 is preserved, not normalized to 0",
      payload: { v: new CanonicalFloat(-0) },
      canonical: '{"v":-0.0}',
      sha256: "cabee4e2dbe1f13e73a57ed5e6fa673015cade6cded4b8932f95beb5b7854664",
    },
    {
      why: "non-ASCII escaped lowercase-hex; keys sorted at every level; no whitespace",
      payload: { b: { z: 1, a: "\u00e9" }, a: [1, new CanonicalFloat(2.5), null, true] },
      canonical: '{"a":[1,2.5,null,true],"b":{"a":"\\u00e9","z":1}}',
      sha256: "f5a22342a232ec97fca871d262572344229a13209f7b5ed7b27b2a93c42b5133",
    },
  ];

  for (const c of cases) {
    it(`canonical bytes + hash match: ${c.why}`, async () => {
      expect(canonical_json(c.payload)).toBe(c.canonical);
      expect(await sha256_of("\n" + c.canonical)).toBe(c.sha256);
    });
  }

  it("a ledger turn with an INTEGRAL created_at canonicalizes it as a float (2.0, not 2)", async () => {
    // The real bug: a bare String(2) verifier reads an intact chain as
    // TAMPERED. turn_hash wraps created_at, so an integral timestamp
    // hashes as the hub wrote it.
    const turn = { ...PARITY_TURN, created_at: 2 } as LedgerTurn;
    const with_float = await turn_hash("", turn, "commons");
    // The same turn hashed with created_at as a plain integer (the old
    // broken behavior) must DIFFER — proving the fix is load-bearing.
    const broken = await sha256_of("\n" + canonical_json({ ...fields_of(turn, "commons"), created_at: 2 }));
    expect(with_float).not.toBe(broken);
    // And it equals the float-canonical form.
    const fixed = await sha256_of("\n" + canonical_json({ ...fields_of(turn, "commons"), created_at: new CanonicalFloat(2) }));
    expect(with_float).toBe(fixed);
  });

  it("py_float_repr matches Python repr on the pinned magnitudes", () => {
    expect(py_float_repr(2.0)).toBe("2.0");
    expect(py_float_repr(1e-7)).toBe("1e-07");
    expect(py_float_repr(1e16)).toBe("1e+16");
    expect(py_float_repr(-0)).toBe("-0.0");
    expect(py_float_repr(2.5)).toBe("2.5");
    expect(py_float_repr(1783382860.341553)).toBe("1783382860.341553");
  });
});

function fields_of(turn: LedgerTurn, channel: string): Record<string, unknown> {
  return {
    id: turn.id, seq: turn.seq, sender: turn.sender, kind: turn.kind,
    status: turn.status, urgency: turn.urgency, critical: turn.critical,
    downgraded: turn.downgraded, to: turn.to, title: turn.title,
    body: turn.body, data: turn.data, reply_to: turn.reply_to,
    created_at: turn.created_at, channel,
  };
}

async function build_chain(turns: Omit<LedgerTurn, "hash">[], channel: string): Promise<LedgerTurn[]> {
  const out: LedgerTurn[] = [];
  let prev = "";
  for (const t of turns) {
    const full = { ...t, hash: null } as LedgerTurn;
    const h = await turn_hash(prev, full, channel);
    out.push({ ...full, hash: h });
    prev = h;
  }
  return out;
}

function mk(seq: number, body: string): Omit<LedgerTurn, "hash"> {
  return {
    id: `01T${String(seq).padStart(23, "0")}`, seq, sender: "a", kind: "message",
    status: "fyi", urgency: "inbox", critical: 0, downgraded: 0, to: [],
    title: "", body, data: null, reply_to: null, created_at: 1000 + seq,
  };
}

describe("verify_ledger chain walk", () => {
  it("verifies an intact chain (head matches)", async () => {
    const turns = await build_chain([mk(1, "one"), mk(2, "two"), mk(3, "three")], "c");
    const verdict = await verify_ledger({ channel: "c", count: 3, head: turns[2].hash!, turns });
    expect(verdict).toMatchObject({ ok: true, broken_at: null, head_mismatch: false, hashed: 3, legacy: 0 });
  });

  it("detects a tampered body (first broken seq named)", async () => {
    const turns = await build_chain([mk(1, "one"), mk(2, "two"), mk(3, "three")], "c");
    turns[1] = { ...turns[1], body: "TAMPERED" };
    const verdict = await verify_ledger({ channel: "c", count: 3, head: turns[2].hash!, turns });
    expect(verdict.ok).toBe(false);
    expect(verdict.broken_at).toBe(2);
  });

  it("detects a served-head mismatch on an internally consistent chain", async () => {
    const turns = await build_chain([mk(1, "one"), mk(2, "two")], "c");
    const verdict = await verify_ledger({ channel: "c", count: 2, head: "0".repeat(64), turns });
    expect(verdict.ok).toBe(false);
    expect(verdict.head_mismatch).toBe(true);
  });

  it("tolerates unhashed pre-ledger history but flags unhashed rows after the chain starts", async () => {
    const legacy: LedgerTurn = { ...mk(1, "old"), hash: null } as LedgerTurn;
    const chained = await build_chain([mk(2, "two")], "c");
    const ok_verdict = await verify_ledger({ channel: "c", count: 2, head: chained[0].hash!, turns: [legacy, ...chained] });
    expect(ok_verdict.ok).toBe(true);
    expect(ok_verdict.legacy).toBe(1);

    const late_unhashed: LedgerTurn = { ...mk(3, "late"), hash: null } as LedgerTurn;
    const bad = await verify_ledger({ channel: "c", count: 3, head: chained[0].hash!, turns: [...chained, late_unhashed] });
    expect(bad.ok).toBe(false);
    expect(bad.broken_at).toBe(3);
  });
});
