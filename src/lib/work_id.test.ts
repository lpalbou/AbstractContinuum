// Pins for the S3 join vocabulary (decision:work-item-vocabulary): the id
// grammar, the item-file derivation, mention extraction, and the RENDERED
// state words — which must stay pure derivations (S0 governance clause:
// continuum owns this closed set; a word that cannot be derived from
// file+claim+receipt does not exist).
import { describe, expect, it } from "vitest";

import {
  basename_of_card_path,
  claim_age_label,
  claim_key_for,
  derive_work_state,
  parse_card_path,
  extract_work_ids,
  parse_work_id,
  work_id_for_item,
} from "./work_id";

describe("parse_work_id (S0 grammar: <package>-<NNNN>, last-hyphen parse)", () => {
  it("parses plain and hyphen-bearing package names", () => {
    expect(parse_work_id("agora-0093")).toEqual({ package: "agora", num: "0093" });
    expect(parse_work_id("abstractframework-0017")).toEqual({ package: "abstractframework", num: "0017" });
    // Hyphens in the head survive the LAST-hyphen rule.
    expect(parse_work_id("my-pkg-0001")).toEqual({ package: "my-pkg", num: "0001" });
  });

  it("rejects non-conforming forms", () => {
    expect(parse_work_id("agora#93")).toBeNull(); // ruled out: URL fragment
    expect(parse_work_id("agora-93x")).toBeNull();
    expect(parse_work_id("-0093")).toBeNull();
    expect(parse_work_id("agora-")).toBeNull();
    expect(parse_work_id("")).toBeNull();
  });
});

describe("work_id_for_item (filename -> id, zero-padded)", () => {
  it("derives from NNNN_slug.md and NNN-slug.md conventions", () => {
    expect(work_id_for_item("abstractgateway", "0087_run_start_skills.md")).toBe("abstractgateway-0087");
    expect(work_id_for_item("abstractframework", "017-framework-unified-work.md")).toBe("abstractframework-0017");
  });

  it("returns null when no leading number (no id yet — additive migration)", () => {
    expect(work_id_for_item("pkg", "notes.md")).toBeNull();
    expect(work_id_for_item("", "0001_x.md")).toBeNull();
  });

  it("claim key spelling matches the store grammar", () => {
    expect(claim_key_for("agora-0093")).toBe("claim:agora-0093");
  });
});

describe("extract_work_ids (Team-page linkification)", () => {
  it("finds valid ids in prose, deduped, capped", () => {
    expect(extract_work_ids("shipped abstractframework-0017 (see agora-0093, again abstractframework-0017)")).toEqual([
      "abstractframework-0017",
      "agora-0093",
    ]);
  });

  it("never matches prose hyphen-number shapes without the 4-digit tail", () => {
    expect(extract_work_ids("a top-10 list and utf-8 text")).toEqual([]);
  });

  it("rejects short prose heads even with a 4-digit tail (live false positive: 'pre-0049')", () => {
    expect(extract_work_ids("the pre-0049 baseline")).toEqual([]);
    expect(extract_work_ids("agora-0093 still qualifies")).toEqual(["agora-0093"]);
  });
});

describe("derive_work_state (rendered words are pure derivations)", () => {
  const claim = { owner: "continuum", started_at: "2026-07-18T03:00:00Z" };

  it("planned + live claim = in-progress; receipts flip to in-review", () => {
    expect(derive_work_state("planned", claim, null)).toBe("in-progress");
    expect(derive_work_state("planned", claim, 2)).toBe("in-review");
    // Receipts without a live claim still read in-review (work returned,
    // owner close pending) — the receipt is the stronger signal.
    expect(derive_work_state("planned", null, 1)).toBe("in-review");
  });

  it("no claim, no receipts: the at-rest directory word stands", () => {
    expect(derive_work_state("planned", null, null)).toBe("planned");
    expect(derive_work_state("proposed", claim, null)).toBe("proposed"); // claims never promote triage
    expect(derive_work_state("completed", claim, 3)).toBe("completed");
  });
});

describe("claim_age_label (S4 render fold v1)", () => {
  const now = Date.parse("2026-07-18T12:00:00Z");

  it("labels age and flags staleness past the threshold", () => {
    expect(claim_age_label({ owner: "x", started_at: "2026-07-18T11:30:00Z" }, now)).toEqual({ label: "claimed 30m", stale: false });
    expect(claim_age_label({ owner: "x", started_at: "2026-07-16T12:00:00Z" }, now)).toEqual({ label: "claimed 2d", stale: true });
  });

  it("returns null for missing/unparseable started_at (never fabricates)", () => {
    expect(claim_age_label({ owner: "x" }, now)).toBeNull();
    expect(claim_age_label({ owner: "x", started_at: "not a date" }, now)).toBeNull();
  });

  it("accepts epoch seconds and milliseconds", () => {
    expect(claim_age_label({ owner: "x", started_at: now / 1000 - 7200 }, now)?.label).toBe("claimed 2h");
    expect(claim_age_label({ owner: "x", started_at: now - 7_200_000 }, now)?.label).toBe("claimed 2h");
  });
});

describe("card path helpers (dm 110)", () => {
  it("basename tolerates prefixes and backslashes", () => {
    expect(basename_of_card_path("docs/backlog/planned/0017_operator_desk.md")).toBe("0017_operator_desk.md");
    expect(basename_of_card_path("./docs\\backlog\\completed\\0011_x.md")).toBe("0011_x.md");
    expect(basename_of_card_path("")).toBe("");
  });

  it("parse_card_path extracts (kind, filename); unknown shapes null", () => {
    expect(parse_card_path("docs/backlog/planned/0017_operator_desk.md")).toEqual({ kind: "planned", filename: "0017_operator_desk.md" });
    expect(parse_card_path("docs/backlog/completed/0011_unified.md")).toEqual({ kind: "completed", filename: "0011_unified.md" });
    expect(parse_card_path("workspace/notes.md")).toBeNull();
    expect(parse_card_path(undefined)).toBeNull();
  });
});
