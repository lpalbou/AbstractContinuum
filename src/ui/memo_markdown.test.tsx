// @vitest-environment jsdom
// Render-count probe for the MemoMarkdown boundary (backlog 0010
// acceptance: unchanged rows must not re-parse markdown when the page
// re-renders on new traffic). The kit parser is mocked to count calls —
// the boundary's whole job is keeping that count at one per distinct text.
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";

const parse_calls: string[] = [];
vi.mock("@abstractframework/panel-chat", () => ({
  Markdown: (props: { text: string }) => {
    parse_calls.push(props.text);
    return React.createElement("div", { className: "mock-md" }, props.text);
  },
}));

import { MemoMarkdown } from "./memo_markdown";

function Harness(props: { texts: string[] }): React.ReactElement {
  // Unrelated state churn stands in for "new traffic re-rendered the page".
  const [tick, set_tick] = useState(0);
  return (
    <div data-tick={tick}>
      <button onClick={() => set_tick((t) => t + 1)}>tick</button>
      {props.texts.map((t, i) => (
        <MemoMarkdown key={i} text={t} />
      ))}
    </div>
  );
}

describe("MemoMarkdown render-count (backlog 0010)", () => {
  it("unchanged rows parse once across unrelated parent re-renders; changed text re-parses", async () => {
    parse_calls.length = 0;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<Harness texts={["alpha", "beta", "gamma"]} />);
    });
    expect(parse_calls).toEqual(["alpha", "beta", "gamma"]);

    // Parent re-renders (unrelated state) — zero re-parses.
    const btn = host.querySelector("button")!;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(parse_calls).toEqual(["alpha", "beta", "gamma"]);

    // New traffic: one row's text changes — exactly ONE re-parse. The
    // string prop is recomputed each render (autolink pipeline), so this
    // also pins that VALUE equality (not reference identity) governs.
    await act(async () => {
      root.render(<Harness texts={["alpha", "beta " + "edited".slice(0), "gamma"]} />);
    });
    expect(parse_calls).toEqual(["alpha", "beta", "gamma", "beta edited"]);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
