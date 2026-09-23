// @vitest-environment jsdom
// Pins on the kit Markdown renderer for the message-body path (operator
// dm 41/48/67). Continuum consumes @abstractframework/panel-chat via the
// src alias, and the kit has no test rig of its own — these pins live in
// the consumer that hit the defects.
//
// The dm 67 defect: a table whose header row follows a prose line with NO
// blank line between (the standard assistant status-table emission —
// "DONE\n| # | Item |\n|---|---|") was swallowed into the paragraph and
// rendered as piped prose. GitHub treats a table header+separator as a
// paragraph interrupter, exactly like list items.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

import { Markdown } from "@abstractframework/panel-chat";

const TABLE = "| # | Item | Outcome |\n|---|------|--------|\n| 1 | Reception | armed |\n| 2 | Stack | healthy |";

describe("kit Markdown tables in message bodies", () => {
  it("renders a blank-line-preceded table (the always-working case)", () => {
    const { container } = render(<Markdown text={`intro line\n\n${TABLE}`} />);
    const table = container.querySelector("table.pc-md_table");
    expect(table).toBeTruthy();
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("a table INTERRUPTS a paragraph — no blank line needed (operator dm 67: framework's status tables)", () => {
    const { container } = render(<Markdown text={`DONE (since 18:45)\n${TABLE}`} />);
    const table = container.querySelector("table.pc-md_table");
    expect(table).toBeTruthy();
    expect(table?.querySelectorAll("thead th")).toHaveLength(3);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(2);
    // The intro line stays prose — the table is not swallowed into it.
    expect(container.textContent).toContain("DONE (since 18:45)");
    expect(container.querySelector("p")?.textContent).not.toContain("| # |");
  });

  it("a pipe mid-prose without a separator line stays a paragraph (no false tables)", () => {
    const { container } = render(<Markdown text={"choose a | b today\nand tell me"} />);
    expect(container.querySelector("table")).toBeNull();
  });
});
