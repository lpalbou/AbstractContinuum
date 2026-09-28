// The history window for conversation history replayed to a model
// (operator ruling 2026-09-28, ADR-0026): models get their full context;
// replayed history is the NEWEST WHOLE messages up to 50,000 estimated
// tokens, and what was replayed or dropped is recorded. Nothing here cuts a
// message: budgets are met by selection, never by slicing (ADR-0026 §3).
//
// This mirrors abstractruntime's one rule (session_history.fold_history_window
// + memory.token_budget.estimate_tokens, runtime commit b97d8f4) for text this
// app renders into a single prompt, where the runtime's window cannot see
// individual messages. Candidate for @abstractframework/ui-kit once a second
// app needs it (AbstractFlow carries the same function for the same reason).

/** Same budget as abstractruntime `HISTORY_REPLAY_MAX_TOKENS`. */
export const HISTORY_REPLAY_MAX_TOKENS = 50_000;

/** Named in every report so a reader knows which estimate produced the numbers. */
export const TOKEN_ESTIMATOR = "abstractcontinuum history_window.estimate_tokens (~4 chars per token)";

/**
 * Token estimate for a string: about 4 characters per token, at least 1 for
 * non-empty text. The same rule as abstractruntime
 * `memory.token_budget.estimate_tokens` when AbstractCore's tokenizer is not
 * available (a browser has none). It sizes the window only; it never cuts.
 */
export function estimate_tokens(text: string): number {
  const s = String(text ?? "");
  if (!s) return 0;
  return Math.max(1, Math.floor(s.length / 4));
}

export type HistoryWindowReport = {
  policy: "newest_whole_messages";
  max_tokens: number;
  token_estimator: string;
  total_messages: number;
  replayed_messages: number;
  replayed_tokens: number;
  dropped_messages: number;
  dropped_tokens: number;
  /** True when the newest message alone exceeds the window and was kept whole. */
  oversize_message_kept: boolean;
};

/**
 * Keep the newest whole items that fit `max_tokens`; return them in their
 * original (chronological) order with the window's report.
 *
 * The walk goes newest-first and stops at the first item that does not fit,
 * so the window is contiguous (skipping one large item to keep older ones
 * would leave a hole in the conversation). A total of exactly `max_tokens`
 * fits. When the NEWEST item alone is larger than the window it is kept whole
 * and alone (`oversize_message_kept`): cutting it would be lossy truncation of
 * the most relevant message, and a message the model's context cannot hold
 * fails loudly at the provider instead of disappearing here.
 */
export function fold_history_window<T>(
  items: T[],
  tokens_of: (item: T) => number,
  max_tokens: number = HISTORY_REPLAY_MAX_TOKENS
): { kept: T[]; report: HistoryWindowReport } {
  if (!Number.isInteger(max_tokens) || max_tokens <= 0) {
    throw new Error(`history window max_tokens must be a positive integer, got ${max_tokens}`);
  }
  const sized = items.map((item) => ({ item, tokens: tokens_of(item) }));
  let kept_tokens = 0;
  let start = sized.length;
  let oversize = false;
  for (let i = sized.length - 1; i >= 0; i--) {
    const t = sized[i].tokens;
    if (kept_tokens + t > max_tokens) {
      if (start === sized.length) {
        oversize = true;
        kept_tokens += t;
        start = i;
      }
      break;
    }
    kept_tokens += t;
    start = i;
  }
  const dropped = sized.slice(0, start);
  return {
    kept: sized.slice(start).map((s) => s.item),
    report: {
      policy: "newest_whole_messages",
      max_tokens,
      token_estimator: TOKEN_ESTIMATOR,
      total_messages: sized.length,
      replayed_messages: sized.length - start,
      replayed_tokens: kept_tokens,
      dropped_messages: dropped.length,
      dropped_tokens: dropped.reduce((n, s) => n + s.tokens, 0),
      oversize_message_kept: oversize,
    },
  };
}
