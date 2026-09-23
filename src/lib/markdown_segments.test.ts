// Pins for the prose/mermaid splitter (iteration-3: the pathway graph
// renders as a diagram; everything else stays with the sanitizing
// renderer — a wrong split would feed peer text to the wrong engine).
import { describe, expect, it } from "vitest";

import { split_markdown_segments } from "./markdown_segments";

describe("split_markdown_segments", () => {
  it("splits prose around a mermaid fence", () => {
    const md = "# Graph\n\n```mermaid\ngraph TD\n  A --> B\n```\n\ntail prose";
    expect(split_markdown_segments(md)).toEqual([
      { kind: "md", text: "# Graph\n" },
      { kind: "mermaid", text: "graph TD\n  A --> B" },
      { kind: "md", text: "\ntail prose" },
    ]);
  });

  it("plain markdown stays one prose segment; other fences untouched", () => {
    const md = "text\n```python\nprint(1)\n```\nmore";
    expect(split_markdown_segments(md)).toEqual([{ kind: "md", text: md }]);
  });

  it("an unterminated mermaid fence renders as prose (never half a diagram)", () => {
    const md = "intro\n```mermaid\ngraph TD\n  A --> B";
    expect(split_markdown_segments(md)).toEqual([{ kind: "md", text: md }]);
  });

  it("matches the info string exactly (case-insensitive), tilde fences included", () => {
    expect(split_markdown_segments("~~~MERMAID\nflowchart LR\n~~~")).toEqual([{ kind: "mermaid", text: "flowchart LR" }]);
    // mermaid-js (a different info string) is NOT split.
    expect(split_markdown_segments("```mermaid-js\nx\n```")).toEqual([{ kind: "md", text: "```mermaid-js\nx\n```" }]);
  });
});
