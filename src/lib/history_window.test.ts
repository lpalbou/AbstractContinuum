import { describe, expect, it } from "vitest";

import { estimate_tokens, fold_history_window, HISTORY_REPLAY_MAX_TOKENS } from "./history_window";

describe("estimate_tokens (mirrors abstractruntime memory.token_budget fallback)", () => {
  it("is ~4 chars per token, at least 1 for non-empty text, 0 for empty", () => {
    expect(estimate_tokens("")).toBe(0);
    expect(estimate_tokens("a")).toBe(1);
    expect(estimate_tokens("abcd")).toBe(1);
    expect(estimate_tokens("x".repeat(4000))).toBe(1000);
    expect(estimate_tokens("x".repeat(4003))).toBe(1000);
  });
});

describe("fold_history_window (newest whole messages up to the budget)", () => {
  const len = (s: string) => s.length;

  it("defaults to the runtime's 50,000-token window", () => {
    expect(HISTORY_REPLAY_MAX_TOKENS).toBe(50_000);
    expect(fold_history_window(["a"], len).report.max_tokens).toBe(50_000);
  });

  it("keeps everything that fits, in chronological order", () => {
    const { kept, report } = fold_history_window(["aa", "bbb", "c"], len, 10);
    expect(kept).toEqual(["aa", "bbb", "c"]);
    expect(report).toMatchObject({ replayed_messages: 3, replayed_tokens: 6, dropped_messages: 0, dropped_tokens: 0, total_messages: 3 });
  });

  it("a total of exactly max_tokens fits", () => {
    expect(fold_history_window(["aaaaa", "bbbbb"], len, 10).report.dropped_messages).toBe(0);
  });

  it("drops the oldest whole items and is contiguous (never skips a large item to keep older ones)", () => {
    const { kept, report } = fold_history_window(["a", "b", "cccccccc", "dd", "ee"], len, 6);
    expect(kept).toEqual(["dd", "ee"]);
    expect(report).toMatchObject({ replayed_messages: 2, replayed_tokens: 4, dropped_messages: 3, dropped_tokens: 10 });
  });

  it("keeps an oversize newest item whole and alone", () => {
    const { kept, report } = fold_history_window(["old", "x".repeat(50)], len, 10);
    expect(kept).toEqual(["x".repeat(50)]);
    expect(report).toMatchObject({ oversize_message_kept: true, replayed_messages: 1, replayed_tokens: 50, dropped_messages: 1 });
  });

  it("refuses a non-positive budget loudly", () => {
    expect(() => fold_history_window(["a"], len, 0)).toThrow(/positive integer/);
  });
});
