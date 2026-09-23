// Pins for the patches -> whole-document selection fold (entity Skills
// section). The payload shapes mirror the gateway's live matrix builder
// (entity_skills.py): one "skills" section, item id = skill name, cells
// keyed by ruled phase, `assigned` = stored selection membership.
import { describe, expect, it } from "vitest";

import { fold_selection } from "./entity_skills_model";

const PHASES = ["visit", "own_time", "dream", "work"];

function cell(assigned: boolean, resolved = assigned) {
  return {
    availability: assigned ? (resolved ? "granted" : "trust_gated") : "denied",
    ...(assigned && !resolved ? { trust_state: "requires_review" } : {}),
    provenance: assigned ? "operator" : "default",
    assigned,
    resolved_value: resolved,
  };
}

function payload(items: Array<{ id: string; on: string[]; gated?: boolean }>) {
  return {
    schema_version: 1,
    phases: PHASES.map((id) => ({ id })),
    sections: [
      {
        id: "skills",
        label: "Skills",
        items: items.map((it) => ({
          id: it.id,
          label: it.id,
          cells: Object.fromEntries(PHASES.map((p) => [p, cell(it.on.includes(p), it.on.includes(p) && !it.gated)])),
        })),
      },
    ],
  };
}

describe("fold_selection (matrix patches -> gateway PUT document)", () => {
  it("round-trips the stored selection with zero patches", () => {
    const p = payload([
      { id: "agora-collaboration", on: PHASES }, // global
      { id: "diary-craft", on: ["visit", "own_time"] },
      { id: "unselected", on: [] },
    ]);
    expect(fold_selection(p, [])).toEqual([
      { name: "agora-collaboration" }, // all-four compacts to global
      { name: "diary-craft", phases: ["visit", "own_time"] },
    ]);
  });

  it("applies grant/deny/clear patches on top of the stored word", () => {
    const p = payload([{ id: "diary-craft", on: ["visit", "own_time"] }]);
    const sel = fold_selection(p, [
      { section: "skills", item: "diary-craft", phase: "own_time", op: "deny" },
      { section: "skills", item: "diary-craft", phase: "work", op: "grant" },
    ]);
    expect(sel).toEqual([{ name: "diary-craft", phases: ["visit", "work"] }]);
    // clear reverts to UNSELECTED (default provenance = not in selection).
    expect(fold_selection(p, [
      { section: "skills", item: "diary-craft", phase: "visit", op: "clear" },
      { section: "skills", item: "diary-craft", phase: "own_time", op: "clear" },
    ])).toEqual([]);
  });

  it("trust-gated cells still count as SELECTED (selection and trust are different axes)", () => {
    const p = payload([{ id: "blocked-skill", on: ["visit"], gated: true }]);
    expect(fold_selection(p, [])).toEqual([{ name: "blocked-skill", phases: ["visit"] }]);
  });

  it("granting every phase compacts to the global form", () => {
    const p = payload([{ id: "diary-craft", on: ["visit", "own_time"] }]);
    const sel = fold_selection(p, [
      { section: "skills", item: "diary-craft", phase: "dream", op: "grant" },
      { section: "skills", item: "diary-craft", phase: "work", op: "grant" },
    ]);
    expect(sel).toEqual([{ name: "diary-craft" }]);
  });

  it("refuses an invalid payload with null (never guesses a selection)", () => {
    expect(fold_selection({ schema_version: 2 }, [])).toBeNull();
  });
});
