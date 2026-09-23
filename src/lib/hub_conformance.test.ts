/**
 * Golden-vector conformance (agora-0121 parity spine, vector 05).
 *
 * The hub pins behavioral conformance in language-independent vectors
 * (`tests/vectors/*.json` — HTTP replay fixtures). The console cannot
 * replay HTTP in a unit test, so it consumes the vector through a tiny
 * REFERENCE MODEL of the ratings contract (one standing ±1 per
 * (rater, message); tally = counts + viewer's own standing):
 *
 *  1. The simulation replays every rate/unrate op in the vector and must
 *     reproduce EVERY served row the vector pins — this validates the
 *     console's understanding of hub semantics against the artifact
 *     itself, not against hand-copied expectations. Re-vendor a vector
 *     with changed semantics (e.g. flip becomes withdraw-then-cast) and
 *     these tests FAIL (adversary P1-3: the first version hardcoded the
 *     golden rows and stayed green through exactly that mutation).
 *  2. Each op transition also drives the console's optimistic overlay
 *     (`overlay_rating_tally`): the overlay's prediction from the rater's
 *     stale pre-op row must equal the post-op served truth — that is the
 *     property the thumbs UI depends on between polls.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { overlay_rating_tally } from "./team_model";
import { HUB_CONTRACT_PINNED, MESSAGE_RATINGS_SEMANTIC, SEARCH_GROUPED_SEMANTIC, UNIFIED_SCORE_SEMANTIC } from "./hub_contract";

const here = dirname(fileURLToPath(import.meta.url));
const vector = JSON.parse(
  readFileSync(join(here, "..", "..", "vendor", "hub", "vector_05_message_ratings.json"), "utf8"),
);
const openapi = JSON.parse(
  readFileSync(join(here, "..", "..", "vendor", "hub", "openapi.json"), "utf8"),
);

type Tally = { up: number; down: number; mine: number };
type Standings = Map<string, number>; // `${rater}\u0000${msg}` -> ±1

/** Vector refs look like "$m1.id" / "$m1.seq" — normalize to "m1". */
function msg_ref(raw: unknown): string {
  return String(raw).replace(/^\$/, "").replace(/\.(id|seq)$/, "");
}

/** Reference fold of the ratings contract: one standing ±1 per
 *  (rater, message); tally = counts of standings + the viewer's own. */
function tally_of(standings: Standings, msg: string, viewer: string): Tally {
  let up = 0;
  let down = 0;
  let mine = 0;
  for (const [key, value] of standings) {
    const [rater, m] = key.split("\u0000");
    if (m !== msg) continue;
    if (value > 0) up += 1;
    else if (value < 0) down += 1;
    if (rater === viewer) mine = value;
  }
  return { up, down, mine };
}

/** Replay the vector chronologically. Yields one entry per pinned served
 *  row: the simulated tally, the vector's served tally, a SNAPSHOT of the
 *  standings at that instant, and — when the row is the rater's own next
 *  view after their op with NO other rater's op intervening — the
 *  overlay's real-transition prediction. (An intervened stale view is
 *  exactly the case the overlay cannot and must not predict through; the
 *  console converges on the next poll — the vector itself exposed this:
 *  carol's withdraw follows bob's flip on the same row.) */
function replay(): Array<{
  label: string;
  viewer: string;
  msg: string;
  simulated: Tally;
  served: Tally;
  standings: Standings;
  overlay?: { predicted: Tally; from_stale: Tally; local: number };
}> {
  const standings: Standings = new Map();
  const out: ReturnType<typeof replay> = [];
  // Latest pinned served row per (viewer, msg) + the per-message op count
  // at serve time — the freshness token for the overlay property.
  const last_served = new Map<string, { tally: Tally; at_op: number }>();
  const ops_on = new Map<string, number>(); // msg -> ops applied so far
  const pending = new Map<string, { from_stale: Tally; local: number }>();

  const steps: any[] = [...(vector.setup || []), ...(vector.expect || [])];
  for (const step of steps) {
    if (step.op === "rate" || step.op === "unrate") {
      const msg = msg_ref(step.message);
      const key = `${step.as}\u0000${msg}`;
      const stale = last_served.get(key);
      // Arm the real-transition check only from an UN-INTERVENED view.
      if (stale && stale.at_op === (ops_on.get(msg) || 0)) {
        pending.set(key, {
          from_stale: stale.tally,
          local: step.op === "rate" ? Number(step.value) : 0,
        });
      }
      if (step.op === "rate") standings.set(key, Number(step.value));
      else standings.delete(key);
      ops_on.set(msg, (ops_on.get(msg) || 0) + 1);
      continue;
    }
    if (step.call !== "messages") continue;
    for (const row of step.match_subset || []) {
      if (!row.ratings) continue;
      const msg = msg_ref(row.seq);
      const key = `${step.as}\u0000${msg}`;
      const served: Tally = {
        up: Number(row.ratings.up || 0),
        down: Number(row.ratings.down || 0),
        mine: Number(row.ratings.mine || 0),
      };
      const armed = pending.get(key);
      let overlay: { predicted: Tally; from_stale: Tally; local: number } | undefined;
      if (armed) {
        const p = overlay_rating_tally(armed.from_stale, armed.local);
        overlay = { predicted: { up: p.up, down: p.down, mine: p.mine }, ...armed };
        pending.delete(key);
      }
      out.push({
        label: `${step.as} views ${msg}`,
        viewer: step.as,
        msg,
        simulated: tally_of(standings, msg, step.as),
        served,
        standings: new Map(standings),
        overlay,
      });
      last_served.set(key, { tally: served, at_op: ops_on.get(msg) || 0 });
    }
  }
  return out;
}

describe("hub conformance: message ratings vector (agora-0122)", () => {
  it("vendored vector is the ratings vector and pins served rows", () => {
    expect(String(vector.name)).toMatch(/message ratings/i);
    const rows = replay();
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("reference model reproduces EVERY served row the vector pins (semantics lock)", () => {
    for (const { label, simulated, served } of replay()) {
      expect(simulated, label).toEqual(served);
    }
  });

  it("optimistic overlay predicts each rater's next served row from an un-intervened stale view", () => {
    const checked = replay().filter((r) => r.overlay);
    // The vector must exercise at least one real transition (bob's flip)
    // or the property is untested — fail loudly if a re-vendored vector
    // stops covering it.
    expect(checked.length).toBeGreaterThanOrEqual(1);
    for (const { label, served, overlay } of checked) {
      expect(overlay!.predicted, `${label} (overlay from stale ${JSON.stringify(overlay!.from_stale)} local=${overlay!.local})`).toEqual(served);
    }
  });

  it("overlay agrees with the reference model on EVERY hypothetical cast/flip/withdraw from every pinned state", () => {
    // Full transition coverage derived from the vector's own states: from
    // each pinned served row, simulate the viewer casting +1, -1, or
    // withdrawing, and require the overlay's optimistic prediction to
    // equal the reference model's ground truth. This is what makes the
    // withdraw/cast arms vector-derived even though the vector's only
    // literal unrate is intervened (carol after bob's flip).
    let transitions = 0;
    for (const { label, viewer, msg, served, standings } of replay()) {
      for (const local of [1, -1, 0]) {
        const hypothetical = new Map(standings);
        const key = `${viewer}\u0000${msg}`;
        if (local === 0) hypothetical.delete(key);
        else hypothetical.set(key, local);
        const truth = tally_of(hypothetical, msg, viewer);
        const p = overlay_rating_tally(served, local);
        expect({ up: p.up, down: p.down, mine: p.mine }, `${label}: hypothetical local=${local}`).toEqual(truth);
        transitions++;
      }
    }
    expect(transitions).toBeGreaterThanOrEqual(15);
  });

  it("overlay with no local click is the served row verbatim (render, never re-derive)", () => {
    for (const { served } of replay()) {
      const t = overlay_rating_tally(served, undefined);
      expect({ up: t.up, down: t.down, mine: t.mine }).toEqual(served);
      expect(t.caught_up).toBe(false);
    }
  });

  it("caught_up fires exactly when the served row already carries the local statement", () => {
    for (const { served } of replay()) {
      const t = overlay_rating_tally(served, served.mine);
      expect(t.caught_up).toBe(served.mine !== undefined);
      expect({ up: t.up, down: t.down, mine: t.mine }).toEqual(served);
    }
  });

  it("never renders negative counts even against a decoration that raced my withdraw", () => {
    // Defensive floor (unit property, not a vector claim): a served row
    // that already dropped my unit must not go negative under the overlay.
    const t = overlay_rating_tally({ up: 0, down: 0, mine: 1 }, -1);
    expect(t.up).toBe(0);
    expect(t.down).toBe(1);
    expect(t.mine).toBe(-1);
  });
});

describe("hub conformance: unified leaderboard (operator rulings dm#129/131)", () => {
  /** Reference fold of the `general` counting rule — the operator's FINAL
   *  ruling (dm#161, agora-0127): RAW NET — a vote is a vote. up/down
   *  count every STANDING rating (one standing per (rater, message); a
   *  flip revises its own message's rating, never stacks); score =
   *  up − down; `raters` = distinct engaged colleagues. No collapse
   *  anywhere. Named categories (axis votes) are NOT implemented here —
   *  vector 05 carries no axis votes (adversary F5: if a re-vendored
   *  vector adds them, the fold-reproduction test fails LOUDLY because
   *  computed.score counts general only; extend this fold then, don't
   *  re-baseline). */
  function board_general(standings: Standings, targets_msgs: Set<string>): { score: number; up: number; down: number; raters: number } {
    let up = 0;
    let down = 0;
    const raters = new Set<string>();
    for (const [key, value] of standings) {
      const [rater, msg] = key.split("\u0000");
      if (!targets_msgs.has(msg)) continue;
      if (value > 0) up += 1;
      else if (value < 0) down += 1;
      raters.add(rater);
    }
    return { score: up - down, up, down, raters: raters.size };
  }

  /** Replay setup+expect chronologically; at each `call: leaderboard`
   *  step, compare the reference fold against the vector's pinned board. */
  function board_checks(): Array<{ pinned: any; computed: any; categories?: string[] }> {
    const standings: Standings = new Map();
    const senders = new Map<string, string>(); // msg ref -> sender
    const out: Array<{ pinned: any; computed: any; categories?: string[] }> = [];
    for (const step of [...(vector.setup || []), ...(vector.expect || [])] as any[]) {
      if (step.op === "post") senders.set(String(step.ref), String(step.as));
      else if (step.op === "rate") standings.set(`${step.as}\u0000${msg_ref(step.message)}`, Number(step.value));
      else if (step.op === "unrate") standings.delete(`${step.as}\u0000${msg_ref(step.message)}`);
      else if (step.call === "leaderboard" && step.match) {
        const board = step.match.leaderboard || [];
        for (const pinned of board) {
          const msgs = new Set([...senders].filter(([, s]) => s === pinned.target).map(([m]) => m));
          const general = board_general(standings, msgs);
          out.push({
            pinned,
            categories: step.match.categories,
            computed: { target: pinned.target, score: general.score, raters: general.raters, breakdown: { general } },
          });
        }
      }
    }
    return out;
  }

  it("reference fold reproduces the vector's pinned unified board (per-message general)", () => {
    const checks = board_checks();
    expect(checks.length).toBeGreaterThanOrEqual(1);
    for (const { pinned, computed } of checks) {
      expect(computed.score, `${pinned.target} score`).toBe(pinned.score);
      expect(computed.raters, `${pinned.target} raters`).toBe(pinned.raters);
      expect(computed.breakdown.general, `${pinned.target} general cell`).toEqual(pinned.breakdown.general);
    }
  });

  it("pinned board rows satisfy the cell invariants (score = up − down; entry score = Σ category scores)", () => {
    for (const { pinned } of board_checks()) {
      let sum = 0;
      for (const [cat, cell] of Object.entries<any>(pinned.breakdown || {})) {
        expect(cell.score, `${pinned.target}.${cat}: score = up − down`).toBe(cell.up - cell.down);
        expect(cell.raters, `${pinned.target}.${cat}: raters is a count`).toBeGreaterThanOrEqual(0);
        sum += cell.score;
      }
      expect(pinned.score, `${pinned.target}: score = Σ categories`).toBe(sum);
    }
  });

  it("vector names the canonical category list with general first", () => {
    const checks = board_checks();
    const cats = checks.find((c) => Array.isArray(c.categories))?.categories;
    expect(cats?.[0]).toBe("general");
    for (const ax of ["trust", "wisdom", "thorough", "helper"]) expect(cats).toContain(ax);
  });
});

describe("hub conformance: grouped search vector (agora-0132)", () => {
  const search_vector = JSON.parse(
    readFileSync(join(here, "..", "..", "vendor", "hub", "vector_06_search_grouped.json"), "utf8"),
  );
  const expects: Array<Record<string, any>> = [...(search_vector.expect || []), ...(search_vector.post_expect || [])];
  const SECTION_IDS = ["decisions", "open_threads", "work", "people", "files", "messages"];

  it("the full-shape match names EXACTLY the console's six fixed sections", () => {
    // The first expect pins every section with shown/total — if the hub
    // renames, adds, or drops a section, re-vendoring the vector fails
    // here before any UI misrenders (F3 lesson: derive from the artifact,
    // never hand-copy).
    const full = expects.find((e) => SECTION_IDS.every((s) => e.match && s in e.match));
    expect(full).toBeTruthy();
    const section_keys = Object.keys(full!.match).filter((k) => typeof full!.match[k] === "object" && full!.match[k] && ("shown" in full!.match[k] || "total" in full!.match[k] || "hits" in full!.match[k]));
    expect(section_keys.sort()).toEqual([...SECTION_IDS].sort());
  });

  it("vector hit rows carry ONLY fields the console's HubSearchHit declares (no body, no score)", () => {
    const declared = new Set([
      "kind", "channel", "ref", "title", "created_at", "snippet", "highlights",
      "seq", "sender", "status", "thread_hits", "ratings",
    ]);
    let seen = 0;
    for (const e of expects) {
      for (const sec of Object.values(e.match || {})) {
        for (const hit of ((sec as any)?.hits as any[]) || []) {
          seen += 1;
          for (const key of Object.keys(hit)) expect(declared.has(key), `undeclared hit field: ${key}`).toBe(true);
          expect("body" in hit).toBe(false);
          expect("score" in hit).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(0); // the vector must actually pin hit rows
  });

  it("pins the LOUD relaxation flag the UI banners on", () => {
    // A natural-language question must relax (relaxed: true) — the banner
    // renders off exactly this flag; a hub that stops serving it would
    // silently loosen results.
    const relaxed_case = expects.find((e) => e.match?.relaxed === true);
    expect(relaxed_case).toBeTruthy();
    const strict_case = expects.find((e) => e.match?.relaxed === false);
    expect(strict_case).toBeTruthy();
  });

  it("pins retraction-unfindability (search must not resurrect retracted words)", () => {
    // post_setup retracts a message; post_expect pins its owner's own
    // search at zero message hits. The console renders served rows only,
    // so this is the guarantee that no retracted body ever reaches a
    // snippet.
    expect((search_vector.post_setup || []).some((op: any) => op.op === "retract")).toBe(true);
    const after = (search_vector.post_expect || [])[0];
    expect(after?.match?.messages).toEqual({ shown: 0, total: 0 });
  });

  it("pins non-member-filter == nonexistent-filter (no existence oracle)", () => {
    // Filtering to a channel you cannot read must be indistinguishable
    // from filtering to one that does not exist — the same zero shape.
    const zero_shapes = expects.filter((e) => Array.isArray(e.channel_filter)).map((e) => JSON.stringify(e.match));
    expect(zero_shapes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(zero_shapes).size).toBe(1);
  });
});

describe("hub conformance: degraded-search vector (agora-0137, semantic honesty)", () => {
  const degraded_vector = JSON.parse(
    readFileSync(join(here, "..", "..", "vendor", "hub", "vector_07_search_degraded.json"), "utf8"),
  );
  const expects: Array<Record<string, any>> = degraded_vector.expect || [];

  it("every pinned response carries mode_used — the field the banner condition keys on", () => {
    expect(expects.length).toBeGreaterThan(0);
    for (const e of expects) {
      expect(typeof e.match?.mode_used).toBe("string");
    }
  });

  it("null coverage means NO semantic layer (never 'zero embedded') — the renderer hides the % on null", () => {
    // The vector pins semantic_coverage: null on the semantic-less hub;
    // my renderer shows the % only when typeof coverage === "number", so
    // null renders nothing — this pin keeps that reading aligned.
    const auto = expects.find((e) => !e.mode && e.match && "semantic_coverage" in e.match);
    expect(auto).toBeTruthy();
    expect(auto!.match.semantic_coverage).toBeNull();
    expect(auto!.match.notice).toBeNull(); // silent AUTO — no permanent noise
  });

  it("explicit mode=semantic on a semantic-less hub earns the verbatim disabled notice ending in the absence disclaimer", () => {
    const forced = expects.find((e) => e.mode === "semantic");
    expect(forced).toBeTruthy();
    const notice = String(forced!.match.notice || "");
    expect(notice.length).toBeGreaterThan(0);
    // The renderer shows this text verbatim + copyable; receipts quote it.
    expect(notice).toMatch(/does not prove absence\.$/);
    expect(forced!.match.mode_used).toBe("lexical"); // honest: what RAN
  });

  it("banner-only-when-lexical: the vector's modes are exactly the set my render condition admits", () => {
    // My condition: show the loosened banner when mode_used is absent OR
    // "lexical". Every degraded-vector response is lexical — if the hub
    // ever pins a fused/semantic row into this vector, this test forces a
    // re-read of the banner rule rather than a silent mismatch.
    for (const e of expects) {
      expect(e.match.mode_used).toBe("lexical");
    }
  });
});

describe("hub contract: generated-schema pins", () => {
  it("compile-time pins evaluated (tsc is the real assertion)", () => {
    expect(HUB_CONTRACT_PINNED.length).toBe(49);
  });

  it("vendored openapi artifact advertises the message-ratings semantic", () => {
    const semantics = openapi?.info?.["x-agora-semantics"] || [];
    expect(semantics).toContain(MESSAGE_RATINGS_SEMANTIC);
  });

  it("vendored openapi artifact advertises the unified-score semantic", () => {
    const semantics = openapi?.info?.["x-agora-semantics"] || [];
    expect(semantics).toContain(UNIFIED_SCORE_SEMANTIC);
  });

  it("vendored openapi artifact carries the rating routes the proxy allowlists", () => {
    const paths = Object.keys(openapi?.paths || {});
    const rating = paths.find((p) => /\/messages\/\{[^}]+\}\/rating$/.test(p));
    expect(rating).toBeTruthy();
    const methods = Object.keys(openapi.paths[rating as string]);
    expect(methods).toContain("put");
    expect(methods).toContain("delete");
  });

  it("vendored openapi artifact advertises the search-grouped semantic + GET /search", () => {
    const semantics = openapi?.info?.["x-agora-semantics"] || [];
    expect(semantics).toContain(SEARCH_GROUPED_SEMANTIC);
    expect(Object.keys(openapi?.paths?.["/search"] || {})).toContain("get");
  });
});
