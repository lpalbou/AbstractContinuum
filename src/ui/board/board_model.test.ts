// Pins for the board model: metadata convention parsing, Definition of
// Ready, metadata line editing, and the column derivation join.
import { describe, expect, it } from "vitest";

import {
  apply_work_claims,
  card_has_chip_meta,
  chip_labels,
  chip_priority,
  derive_board_cards,
  evaluate_readiness,
  normalize_list_priority,
  parse_labels_line,
  parse_work_item_metadata,
  readiness_from_dor_refusal,
  write_metadata_lines,
  is_decision_gate,
  card_is_decision_gate,
} from "./board_model";

const SPEC = `# 0042-continuum: [BUG] Fix the doors

> Created: 2026-07-12 10:00:00 +0200
> Type: bug
> Priority: P1
> Labels: ui, security, Sprint 29

## Summary
The doors are broken and users cannot enter.

## Acceptance Criteria
- [ ] Doors open on click
- [x] Doors close after 3s
- [ ] Criterion 1 (clear, testable)

## Testing (ADR-0019)
- Level A:
  - \`npm test\`
- Level B:
  - \`...\`
- Level C (optional / opt-in):
  - n/a
`;

describe("work item metadata", () => {
  it("parses priority, labels, acceptance, tests, and summary", () => {
    const meta = parse_work_item_metadata(SPEC);
    expect(meta.priority).toBe("P1");
    expect(meta.labels).toEqual(["ui", "security", "sprint-29"]);
    // Placeholder criterion is excluded; checked state carried.
    expect(meta.acceptance).toEqual([
      { text: "Doors open on click", checked: false },
      { text: "Doors close after 3s", checked: true },
    ]);
    // "..." and "n/a" placeholders excluded.
    expect(meta.test_commands).toEqual(["npm test"]);
    expect(meta.has_summary).toBe(true);
  });

  it("returns empty metadata for a template-fresh spec", () => {
    const template = `# {ID}-x: t\n\n> Created: now\n> Type: task\n\n## Summary\nOne paragraph describing what this task accomplishes (user value + outcome).\n\n## Acceptance Criteria\n- [ ] Criterion 1 (clear, testable)\n\n## Testing (ADR-0019)\n- Level A:\n  - \`...\`\n`;
    const meta = parse_work_item_metadata(template);
    expect(meta.priority).toBeNull();
    expect(meta.labels).toEqual([]);
    expect(meta.acceptance).toEqual([]);
    expect(meta.test_commands).toEqual([]);
    expect(meta.has_summary).toBe(false);
  });

  it("normalizes label input", () => {
    expect(parse_labels_line("UI ,  Deep Research , sprint 29,,")).toEqual(["ui", "deep-research", "sprint-29"]);
  });
});

describe("definition of ready", () => {
  it("passes a complete spec", () => {
    const meta = parse_work_item_metadata(SPEC);
    const r = evaluate_readiness({ task_type: "bug" }, meta);
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("names the failing checks for an empty spec", () => {
    const meta = parse_work_item_metadata("# t\n\n## Summary\n");
    const r = evaluate_readiness({ task_type: "weird" }, meta);
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["type", "summary", "acceptance", "tests"]);
  });
});

describe("write_metadata_lines", () => {
  it("updates existing metadata lines in place", () => {
    const out = write_metadata_lines(SPEC, { priority: "P0", labels: ["backend"] });
    expect(out).toContain("> Priority: P0");
    expect(out).toContain("> Labels: backend");
    expect(out).not.toContain("> Priority: P1");
    // Round-trip parses back.
    const meta = parse_work_item_metadata(out);
    expect(meta.priority).toBe("P0");
    expect(meta.labels).toEqual(["backend"]);
  });

  it("inserts lines after the header metadata block when absent", () => {
    const src = "# 0001-x: t\n\n> Created: now\n> Type: task\n\n## Summary\nReal summary.\n";
    const out = write_metadata_lines(src, { priority: "P2", labels: ["a", "b"] });
    const lines = out.split("\n");
    const type_idx = lines.findIndex((l) => l.startsWith("> Type:"));
    const prio_idx = lines.findIndex((l) => l.startsWith("> Priority:"));
    expect(prio_idx).toBeGreaterThan(type_idx);
    expect(prio_idx).toBeLessThan(lines.findIndex((l) => l.startsWith("## Summary")));
    expect(parse_work_item_metadata(out).labels).toEqual(["a", "b"]);
  });

  it("removes lines when cleared", () => {
    const out = write_metadata_lines(SPEC, { priority: null, labels: [] });
    expect(out).not.toContain("> Priority:");
    expect(out).not.toContain("> Labels:");
  });
});

describe("derive_board_cards", () => {
  const item = (kind: string, filename: string, extra: any = {}) =>
    ({ kind, filename, item_id: 1, package: "continuum", title: filename, task_type: "task", parsed: true, ...extra }) as any;
  const req = (request_id: string, status: string, extra: any = {}) =>
    ({ request_id, status, created_at: "2026-07-12T10:00:00Z", ...extra }) as any;

  it("maps kinds and statuses to the right columns", () => {
    const cards = derive_board_cards({
      proposed: [item("proposed", "a.md")],
      planned: [item("planned", "b.md")],
      active_requests: [req("r1", "running", { backlog_filename: "c.md" }), req("r2", "awaiting_qa", { backlog_filename: "d.md" })],
      terminal_requests: [req("r3", "promoted", { backlog_filename: "e.md" }), req("r4", "failed", { backlog_filename: "f.md" })],
      active_items: [
        { request_id: "r1", status: "running", kind: "planned", filename: "c.md", relpath: "docs/backlog/planned/c.md" },
        { request_id: "r2", status: "awaiting_qa", kind: "planned", filename: "d.md", relpath: "docs/backlog/planned/d.md" },
      ],
    });
    const by_key = new Map(cards.map((c) => [c.key, c.column]));
    expect(by_key.get("file:a.md")).toBe("triage");
    expect(by_key.get("file:b.md")).toBe("ready");
    expect(by_key.get("file:c.md")).toBe("in_progress");
    expect(by_key.get("file:d.md")).toBe("in_review");
    // Terminal cards are the ATTEMPT (request key), not the file.
    expect(by_key.get("req:r3")).toBe("done");
    expect(by_key.get("req:r4")).toBe("failed");
  });

  it("never shows a file in two columns while its request is active", () => {
    const cards = derive_board_cards({
      proposed: [],
      planned: [item("planned", "x.md")],
      active_requests: [req("r1", "running", { backlog_filename: "x.md" })],
      terminal_requests: [],
      active_items: [{ request_id: "r1", status: "running", kind: "planned", filename: "x.md", relpath: "docs/backlog/planned/x.md" }],
    });
    const keys = cards.map((c) => c.key);
    expect(keys.filter((k) => k === "file:x.md")).toHaveLength(1);
    expect(cards[0].column).toBe("in_progress");
  });

  it("keeps the planned card when its only request is terminal (iteration path)", () => {
    const cards = derive_board_cards({
      proposed: [],
      planned: [item("planned", "x.md")],
      active_requests: [],
      terminal_requests: [req("r1", "failed", { backlog_filename: "x.md", finished_at: "2026-07-12T11:00:00Z" })],
      active_items: [],
    });
    // Failed lane shows the attempt; Ready keeps the file executable AND
    // carries the failure badge (ruled semantics: Failed is history).
    const columns = cards.map((c) => c.column).sort();
    expect(columns).toEqual(["failed", "ready"]);
    const keys = new Set(cards.map((c) => c.key));
    expect(keys.size).toBe(2);
    const ready = cards.find((c) => c.column === "ready")!;
    expect(ready.recent_failures).toBe(1);
  });

  it("renders batch executions as one multi-item card and keeps members busy", () => {
    // Gateway reality: batch requests carry backlog_filename "batch(N)" and
    // the REAL members only in active_items (backlog_queue expansion).
    const cards = derive_board_cards({
      proposed: [],
      planned: [item("planned", "m1.md"), item("planned", "m2.md"), item("planned", "free.md")],
      active_requests: [req("rbatch", "running", { backlog_filename: "batch(2)" })],
      terminal_requests: [],
      active_items: [
        { request_id: "rbatch", status: "running", kind: "planned", filename: "m1.md", relpath: "docs/backlog/planned/m1.md" },
        { request_id: "rbatch", status: "running", kind: "planned", filename: "m2.md", relpath: "docs/backlog/planned/m2.md" },
      ],
    });
    const batch = cards.find((c) => c.key === "req:rbatch");
    expect(batch).toBeTruthy();
    expect(batch!.title).toBe("Batch execution (2 items)");
    expect(batch!.batch_size).toBe(2);
    expect(batch!.filename).toBeUndefined();
    // Members are BUSY: no phantom Ready cards inviting a 409; the free
    // item stays executable.
    const ready = cards.filter((c) => c.column === "ready").map((c) => c.filename);
    expect(ready).toEqual(["free.md"]);
  });

  it("two concurrent batches never collide on keys", () => {
    const cards = derive_board_cards({
      proposed: [],
      planned: [],
      active_requests: [req("rb1", "running", { backlog_filename: "batch(3)" }), req("rb2", "running", { backlog_filename: "batch(3)" })],
      terminal_requests: [],
      active_items: [],
    });
    const keys = cards.map((c) => c.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("caps Done and Failed to recent history", () => {
    const many = Array.from({ length: 30 }, (_, i) => req(`r${i}`, i % 2 ? "promoted" : "failed", { backlog_filename: `f${i}.md`, finished_at: `2026-07-12T0${i % 10}:00:00Z` }));
    const cards = derive_board_cards({ proposed: [], planned: [], active_requests: [], terminal_requests: many, active_items: [], recent_limit: 5 });
    expect(cards.filter((c) => c.column === "done")).toHaveLength(5);
    expect(cards.filter((c) => c.column === "failed")).toHaveLength(5);
  });

  it("enriches execution cards with file facts from the lists", () => {
    const cards = derive_board_cards({
      proposed: [],
      planned: [item("planned", "x.md", { title: "Nice title", item_id: 42 })],
      active_requests: [req("r1", "running", { backlog_filename: "x.md" })],
      terminal_requests: [],
      active_items: [{ request_id: "r1", status: "running", kind: "planned", filename: "x.md", relpath: "docs/backlog/planned/x.md" }],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Nice title");
    expect(cards[0].item_id).toBe(42);
  });

  it("carries list-level priority/labels onto cards (gateway c1090 contract)", () => {
    const cards = derive_board_cards({
      proposed: [item("proposed", "a.md", { priority: "P1", labels: ["ui", "security"] })],
      // Empty-string priority = the gateway answered "undeclared" (still counts as list metadata).
      planned: [item("planned", "b.md", { priority: "", labels: [] })],
      active_requests: [],
      terminal_requests: [],
      active_items: [],
    });
    const a = cards.find((c) => c.key === "file:a.md")!;
    expect(a.priority).toBe("P1");
    expect(a.labels).toEqual(["ui", "security"]);
    expect(card_has_chip_meta(a)).toBe(true);
    const b = cards.find((c) => c.key === "file:b.md")!;
    expect(b.priority).toBeNull();
    expect(b.labels).toEqual([]);
    expect(card_has_chip_meta(b)).toBe(true);
  });

  it("leaves chip fields undefined for older gateways (no list metadata keys)", () => {
    const cards = derive_board_cards({
      proposed: [item("proposed", "a.md")],
      planned: [],
      active_requests: [],
      terminal_requests: [],
      active_items: [],
    });
    const a = cards.find((c) => c.key === "file:a.md")!;
    expect(a.priority).toBeUndefined();
    expect(a.labels).toBeUndefined();
    expect(card_has_chip_meta(a)).toBe(false);
  });
});

describe("chip precedence (list metadata vs content scan)", () => {
  const meta = { priority: "P3", labels: ["from-content"], acceptance: [], test_commands: [], has_summary: true } as any;

  it("list-level values win over the content-scan cache", () => {
    const card = { key: "file:x.md", column: "ready", title: "x", priority: "P1", labels: ["from-list"] } as any;
    expect(chip_priority(card, meta)).toBe("P1");
    expect(chip_labels(card, meta)).toEqual(["from-list"]);
  });

  it("a list answer of 'none' is honored, never backfilled from content", () => {
    // The gateway parsed the file and found nothing; trusting the stale
    // content cache here would resurrect deleted metadata.
    const card = { key: "file:x.md", column: "ready", title: "x", priority: null, labels: [] } as any;
    expect(chip_priority(card, meta)).toBeNull();
    expect(chip_labels(card, meta)).toEqual([]);
  });

  it("falls back to the content scan when the list did not answer (#FALLBACK)", () => {
    const card = { key: "file:x.md", column: "ready", title: "x" } as any;
    expect(chip_priority(card, meta)).toBe("P3");
    expect(chip_labels(card, meta)).toEqual(["from-content"]);
    expect(chip_priority(card, undefined)).toBeNull();
    expect(chip_labels(card, undefined)).toEqual([]);
  });

  it("normalizes list priorities defensively", () => {
    expect(normalize_list_priority("p2")).toBe("P2");
    expect(normalize_list_priority("")).toBeNull();
    expect(normalize_list_priority("P9")).toBeNull();
    expect(normalize_list_priority(undefined)).toBeNull();
  });
});

describe("readiness_from_dor_refusal (server gate 409, c1140)", () => {
  it("parses the REAL wire shape: FastAPI wraps the refusal in {detail}", () => {
    // Pinned against the gateway's own test (test_backlog_dor_gate.py reads
    // r.json()["detail"]["error"]) — never a hand-written double again
    // (adversarial P0 2026-07-13).
    const r = readiness_from_dor_refusal({
      status: 409,
      body: {
        detail: {
          error: "definition_of_ready_failed",
          checks: [
            { id: "type", label: "Work type is set", ok: true, evidence: "type: bug" },
            { id: "tests", label: "At least one concrete test command", ok: false, evidence: "none found under ## Testing" },
          ],
        },
      },
    });
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    expect(r!.checks).toHaveLength(2);
    expect(r!.checks[1].evidence).toContain("none found");
  });

  it("also accepts an unwrapped body (proxy variants)", () => {
    const r = readiness_from_dor_refusal({
      status: 409,
      body: { error: "definition_of_ready_failed", checks: [{ id: "summary", label: "Summary present", ok: false }] },
    });
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
  });

  it("folds batch member refusals flat with the member path prefixed (detail-wrapped)", () => {
    const r = readiness_from_dor_refusal({
      status: 409,
      body: {
        detail: {
          error: "definition_of_ready_failed",
          members: [{ relpath: "docs/backlog/planned/a.md", checks: [{ id: "summary", label: "Summary present", ok: false }] }],
        },
      },
    });
    expect(r).not.toBeNull();
    expect(r!.checks[0].label).toBe("docs/backlog/planned/a.md: Summary present");
  });

  it("returns null for anything that is not a structured DoR 409", () => {
    expect(readiness_from_dor_refusal({ status: 403, body: { detail: { error: "definition_of_ready_failed", checks: [] } } })).toBeNull();
    expect(readiness_from_dor_refusal({ status: 409, body: { detail: { error: "something_else" } } })).toBeNull();
    expect(readiness_from_dor_refusal({ status: 409, body: { detail: "plain string detail" } })).toBeNull();
    expect(readiness_from_dor_refusal(new Error("plain"))).toBeNull();
    expect(readiness_from_dor_refusal(null)).toBeNull();
  });
});

describe("DoR type check follows the ruled vocabulary (c1123)", () => {
  const good_meta = parse_work_item_metadata(SPEC);

  it("accepts improvement; refuses unknown values with evidence", () => {
    const ok = evaluate_readiness({ task_type: "improvement" }, good_meta);
    expect(ok.checks.find((c) => c.id === "type")!.ok).toBe(true);
    const bad = evaluate_readiness({ task_type: "enhancement" }, good_meta);
    const check = bad.checks.find((c) => c.id === "type")!;
    expect(check.ok).toBe(false);
    expect(check.evidence).toBe("type: enhancement");
  });
});

describe("decision gates (room supervision, c1631)", () => {
  it("detects the decision-gate label case-insensitively", () => {
    expect(is_decision_gate(["decision-gate"])).toBe(true);
    expect(is_decision_gate(["ops", "Decision-Gate"])).toBe(true);
    expect(is_decision_gate(["sprint-3"])).toBe(false);
    expect(is_decision_gate([])).toBe(false);
    expect(is_decision_gate(undefined)).toBe(false);
  });

  it("card gate check prefers list labels and falls back to scanned metadata", () => {
    const gate_card = { labels: ["decision-gate"] } as any;
    expect(card_is_decision_gate(gate_card)).toBe(true);
    const unscanned = { labels: undefined } as any;
    expect(card_is_decision_gate(unscanned, { priority: null, labels: ["decision-gate"], acceptance: [], test_commands: [], has_summary: false })).toBe(true);
    expect(card_is_decision_gate(unscanned, null)).toBe(false);
  });
});

describe("apply_work_claims (S3 seat-work join — rendered, never stored)", () => {
  const planned_card = {
    key: "file:0042_board_join.md",
    column: "ready" as const,
    title: "Board join",
    kind: "planned" as const,
    filename: "0042_board_join.md",
    package: "abstractcontinuum",
  };

  const v = (live: Map<string, any>, done: any[] = [], work: Map<string, any> = new Map()) => ({ live, done, work });

  it("moves a planned card with a live claim into In Progress with owner facts", () => {
    const claims = new Map([["abstractcontinuum-0042", { owner: "continuum", started_at: "2026-07-18T03:00:00Z" }]]);
    const [card] = apply_work_claims([planned_card as any], v(claims));
    expect(card.column).toBe("in_progress");
    expect(card.claim_owner).toBe("continuum");
    expect(card.work_id).toBe("abstractcontinuum-0042");
  });

  it("a live claim without a file card renders a SYNTHETIC in-progress card (dm 94: cross-repo work visible)", () => {
    const claims = new Map([["abstractagent-0029", { owner: "agent", task: "hook steering leak", started_at: 1 }]]);
    const out = apply_work_claims([planned_card as any], v(claims));
    const synth = out.find((c) => c.key === "claim:abstractagent-0029");
    expect(synth?.column).toBe("in_progress");
    expect(synth?.claim_owner).toBe("agent");
    expect(synth?.title).toBe("hook steering leak");
    expect(synth?.package).toBe("abstractagent");
    // The planned card stays in Ready (its id holds no claim).
    expect(out[0].column).toBe("ready");
  });

  it("done-marked claims render as recent Done cards with owner + receipt", () => {
    const out = apply_work_claims([], v(new Map(), [{ item: "abstractcontinuum-0011", owner: "continuum", receipt: "c3049", updated_at: 5 }]));
    expect(out.length).toBe(1);
    expect(out[0].column).toBe("done");
    expect(out[0].claim_owner).toBe("continuum");
    expect(out[0].summary).toBe("c3049");
  });

  it("leaves cards untouched without a matching live claim (and never mutates inputs)", () => {
    const claims = new Map([["otherpkg-0042", { owner: "x" }]]);
    const input = [{ ...planned_card } as any];
    const out = apply_work_claims(input, v(claims));
    expect(out[0].column).toBe("ready");
    expect(input[0].column).toBe("ready");
    // Exec-live and triage cards are out of scope for the MOVE fold.
    const exec_card = { key: "req:1", column: "in_progress", title: "run", request_id: "1" } as any;
    const triage = { ...planned_card, column: "triage", kind: "proposed" } as any;
    const claims2 = new Map([["abstractcontinuum-0042", { owner: "continuum" }]]);
    expect(apply_work_claims([exec_card], v(claims2))[0]).toBe(exec_card);
    expect(apply_work_claims([triage], v(claims2))[0].column).toBe("triage");
  });
});

describe("hub work rows (unified backlog, dm 105; shape = skill c3339)", () => {
  const v2 = (work: Map<string, any>, live: Map<string, any> = new Map()) => ({ live, done: [], work });

  it("renders hub-resident items by their FILE word; planned+live-claim derives in-progress", () => {
    const work = new Map([
      ["abstractskill-0021", { item: "abstractskill-0021", title: "teach mirror rule", status: "planned" }],
      ["abstractagora-0099", { item: "abstractagora-0099", title: "triage idea", status: "proposed" }],
      ["abstractflow-0145", { item: "abstractflow-0145", title: "coding gates", status: "completed", owner: "flow", receipt: "c3040" }],
      ["abstractcore-0800", { item: "abstractcore-0800", title: "parked", status: "deprecated" }],
    ]);
    const live = new Map([["abstractskill-0021", { owner: "skill", started_at: 1 }]]);
    const out = apply_work_claims([], v2(work, live));
    const by_id = Object.fromEntries(out.map((c) => [c.work_id, c]));
    expect(by_id["abstractskill-0021"].column).toBe("in_progress"); // derived, never stored
    expect(by_id["abstractskill-0021"].claim_owner).toBe("skill");
    expect(by_id["abstractagora-0099"].column).toBe("triage");
    expect(by_id["abstractflow-0145"].column).toBe("done");
    expect(by_id["abstractflow-0145"].claim_owner).toBe("flow");
    expect(by_id["abstractcore-0800"]).toBeUndefined(); // deprecated = not board traffic
  });

  it("gateway file cards win dedup over hub rows for the same id", () => {
    const file_card = { key: "file:0042_x.md", column: "ready", title: "X", kind: "planned", filename: "0042_x.md", package: "abstractcontinuum" } as any;
    const work = new Map([["abstractcontinuum-0042", { item: "abstractcontinuum-0042", title: "X (hub)", status: "planned" }]]);
    const out = apply_work_claims([file_card], v2(work));
    expect(out.filter((c) => (c.work_id || "abstractcontinuum-0042") === "abstractcontinuum-0042").length).toBe(1);
    expect(out[0].key).toBe("file:0042_x.md");
  });
});

describe("dual-key dedup + fact transfer (dm 110 audit)", () => {
  it("dedups by card-path basename even when package spellings diverge, transferring hub facts — WITHOUT mutating inputs", () => {
    // Gateway parses package "framework" while the hub id says
    // "abstractframework" — key 1 (derived id) fails; key 2 (basename) wins.
    // Deep-frozen input (wave adversary P1-2): the transfer used to write
    // the caller's card objects in place (React state mutated outside
    // setState — stale claim chips surviving until a full refetch); the
    // fix is copy-on-write, so a frozen input must not throw and the
    // facts must land on the RETURNED card.
    const file_card = Object.freeze({ key: "file:0017_operator_desk.md", column: "ready", title: "Desk", kind: "planned", filename: "0017_operator_desk.md", package: "framework" }) as any;
    const work = new Map([["abstractcontinuum-0017", { item: "abstractcontinuum-0017", title: "desk", status: "planned", card: "docs/backlog/planned/0017_operator_desk.md" }]]);
    const live = new Map([["abstractcontinuum-0017", { owner: "continuum", started_at: 1 }]]);
    const out = apply_work_claims([file_card], { live, done: [], work });
    expect(out.length).toBe(1); // no duplicate synthetic card
    expect(out[0].key).toBe("file:0017_operator_desk.md"); // file wins
    expect(out[0].work_id).toBe("abstractcontinuum-0017"); // facts transferred
    expect(out[0].claim_owner).toBe("continuum");
    expect(out[0].card_path).toBe("docs/backlog/planned/0017_operator_desk.md");
    expect(out[0]).not.toBe(file_card); // copy, never the caller's object
    expect((file_card as any).work_id).toBeUndefined(); // input untouched
  });

  it("transfer lands on the MAPPED card when the map pass already replaced it (live claim + basename match)", () => {
    // A card that is both live-claimed (map branch swaps in a copy) and
    // basename-matched by a work row: the card_path transfer must reach
    // the rendered copy, not the discarded original (P1-2 second half).
    const file_card = Object.freeze({ key: "file:0021_x.md", column: "ready", title: "X", kind: "planned", filename: "0021_x.md", package: "abstractskill" }) as any;
    const work = new Map([["abstractskill-0021", { item: "abstractskill-0021", title: "X", status: "planned", card: "docs/backlog/planned/0021_x.md" }]]);
    const live = new Map([["abstractskill-0021", { owner: "skill", started_at: 1 }]]);
    const out = apply_work_claims([file_card], { live, done: [], work });
    expect(out.length).toBe(1);
    expect(out[0].column).toBe("in_progress"); // map pass moved it
    expect(out[0].claim_owner).toBe("skill");
    expect(out[0].card_path).toBe("docs/backlog/planned/0021_x.md"); // transfer reached the copy
  });

  it("work rows without a file card here carry their card_path for the drawer probe", () => {
    const work = new Map([["agora-0105", { item: "agora-0105", title: "mention addressing", status: "planned", card: "docs/backlog/planned/0105_mention_addressing.md" }]]);
    const out = apply_work_claims([], { live: new Map(), done: [], work });
    expect(out[0].card_path).toBe("docs/backlog/planned/0105_mention_addressing.md");
  });
});
