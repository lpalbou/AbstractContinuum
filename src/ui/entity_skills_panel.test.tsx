// @vitest-environment jsdom
// Smoke pins for the entity Skills panel: renders the gateway's resolved
// view, and Save folds pending matrix patches into the WHOLE-DOCUMENT PUT
// (the wire contract — [{name, phases?}], all-four compacting to global).
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntitySkillsPanel } from "./entity_skills_panel";

const PHASES = ["visit", "own_time", "dream", "work"];

function fixture_view() {
  const cell = (assigned: boolean) => ({
    availability: assigned ? "granted" : "denied",
    provenance: assigned ? "operator" : "default",
    assigned,
    resolved_value: assigned,
  });
  return {
    selection: { exists: true, skills: [{ name: "diary-craft", phases: ["visit"] }], warnings: [] },
    resolved: { skills: [{ name: "diary-craft", active: true, blocked: false, requires_review: false }] },
    matrix: {
      schema_version: 1,
      phases: PHASES.map((id) => ({ id })),
      sections: [
        {
          id: "skills",
          label: "Skills",
          items: [
            {
              id: "diary-craft",
              label: "diary-craft",
              cells: Object.fromEntries(PHASES.map((p) => [p, cell(p === "visit")])),
            },
          ],
        },
      ],
    },
  };
}

describe("EntitySkillsPanel", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders resolved verdicts + matrix, and PUTs the folded selection on save", async () => {
    const put = vi.fn(async (_name: string, skills: any[]) => ({ ...fixture_view(), selection: { exists: true, skills, warnings: [] } }));
    const gateway = {
      entity_skills: vi.fn(async () => fixture_view()),
      put_entity_skills: put,
    } as any;

    await act(async () => {
      root.render(<EntitySkillsPanel gateway={gateway} entity_name="castor" on_close={() => {}} />);
    });

    expect(host.textContent).toContain("diary-craft · active");
    // Grant a phase that is currently OFF (clicking the active op of an
    // already-granted cell is a no-op by kit design), then Save.
    const off_cell = host.querySelector(".af-matrix__cell.is-off");
    expect(off_cell).toBeTruthy();
    const grant = [...off_cell!.querySelectorAll("button")].find((b) => b.textContent === "Grant");
    expect(grant).toBeTruthy();
    await act(async () => {
      grant!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const save = [...host.querySelectorAll("button")].find((b) => (b.textContent || "").startsWith("Save 1"));
    expect(save).toBeTruthy();
    await act(async () => {
      save!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(put).toHaveBeenCalledTimes(1);
    const [, sent] = put.mock.calls[0];
    // visit was stored; one more grant landed — order follows the ruled
    // phase list, and the entry stays phase-scoped (not all four).
    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe("diary-craft");
    expect(Array.isArray(sent[0].phases)).toBe(true);
    expect(sent[0].phases).toContain("visit");
    expect(sent[0].phases!.length).toBe(2);
  });

  it("renders a labeled error when the gateway refuses (never a blank panel)", async () => {
    const gateway = {
      entity_skills: vi.fn(async () => {
        throw new Error("Unauthorized");
      }),
      put_entity_skills: vi.fn(),
    } as any;
    await act(async () => {
      root.render(<EntitySkillsPanel gateway={gateway} entity_name="castor" on_close={() => {}} />);
    });
    expect(host.textContent).toContain("Skills unavailable: Unauthorized");
  });
});
