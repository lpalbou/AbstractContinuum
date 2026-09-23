/**
 * Compile-time drift pins between the console's hand-written hub types and
 * the hub's GENERATED OpenAPI schema (agora-0121 parity spine).
 *
 * The hub commits `openapi.json` at its repo root — "TS/JS clients generate
 * their types from the artifact instead of hand-keeping shapes" (hub
 * docs/api.md). The console keeps its documented hand-written types (the
 * field comments carry operator-facing semantics the generator strips) but
 * PINS them here against the generated `components["schemas"]` so drift
 * becomes a `tsc` failure the moment `npm run gen:hub-types` regenerates
 * from a newer hub.
 *
 * Regen flow: copy the hub's `openapi.json` into `vendor/hub/openapi.json`,
 * run `npm run gen:hub-types`, and let this file (plus the golden-vector
 * conformance tests) tell you what moved.
 *
 * Every declaration below is type-level only — this module emits two tiny
 * constants and no logic. tsc checks it because `include: ["src"]` roots
 * it directly (test files are excluded from tsc — the conformance test's
 * import is for the runtime constants, not type coverage).
 */
import type { components } from "./hub_api_types";
import type { HubMessage } from "./hub_client";

type Schemas = components["schemas"];
type ServedRow = Schemas["MessageRow"];

/** Assignability pin: served value S must be readable as console type C.
 *  (A helper so each pin below is one self-describing line.)
 *  The tuple wrapping `[S] extends [C]` is LOAD-BEARING: a naked type
 *  parameter distributes over unions, so `string | null extends string |
 *  undefined` would evaluate per-arm and the failing `null` arm's `never`
 *  vanishes in the union (`true | never = true`) — exactly the nullability
 *  drift these pins exist to catch (adversary P0-2, mutation-proven). */
type Readable<S, C> = [S] extends [C] ? true : never;

/* ---- MessageRow → HubMessage field pins (the console's read surface) ----
 * `data` is deliberately NOT pinned: the schema serves an open object
 * (`{[k:string]: unknown} | null`) and the console narrows it to the
 * asks/answers/attachments it renders — a runtime-validated narrowing, the
 * one place hand-written stays intentionally stricter than generated. */
type _pin_id = Readable<ServedRow["id"], HubMessage["id"]>;
type _pin_channel = Readable<ServedRow["channel"], HubMessage["channel"]>;
type _pin_seq = Readable<ServedRow["seq"], HubMessage["seq"]>;
type _pin_sender = Readable<ServedRow["sender"], HubMessage["sender"]>;
type _pin_kind = Readable<ServedRow["kind"], HubMessage["kind"]>;
type _pin_status = Readable<ServedRow["status"], HubMessage["status"]>;
type _pin_urgency = Readable<ServedRow["urgency"], HubMessage["urgency"]>;
type _pin_critical = Readable<ServedRow["critical"], HubMessage["critical"]>;
type _pin_to = Readable<ServedRow["to"], HubMessage["to"]>;
type _pin_title = Readable<ServedRow["title"], HubMessage["title"]>;
type _pin_body = Readable<ServedRow["body"], HubMessage["body"]>;
type _pin_reply_to = Readable<ServedRow["reply_to"], HubMessage["reply_to"]>;
type _pin_created_at = Readable<ServedRow["created_at"], HubMessage["created_at"]>;
type _pin_has_resolved_reply = Readable<ServedRow["has_resolved_reply"], HubMessage["has_resolved_reply"]>;
type _pin_retracted = Readable<ServedRow["retracted"], HubMessage["retracted"]>;
type _pin_retracted_at = Readable<ServedRow["retracted_at"], HubMessage["retracted_at"]>;
type _pin_pending_asks = Readable<ServedRow["pending_asks"], HubMessage["pending_asks"]>;
/** agora-0122: the tally decoration — null = no statement (same convention
 *  as pending_asks); the console type must admit null or a served row
 *  breaks the render at the type level. */
type _pin_ratings = Readable<ServedRow["ratings"], HubMessage["ratings"]>;
/** agora-0130: viewer-scoped read decoration (bool|null) — the console
 *  badges cursor>=seq AND read===false as acked-but-never-read. */
type _pin_read = Readable<ServedRow["read"], HubMessage["read"]>;

/* ---- Request-body pins (what the console SENDS) ---- */
/** rate_message body must satisfy CastRating {value: int, note: str}. */
type _pin_cast_rating = Readable<{ value: 1 | -1; note: string }, Schemas["CastRating"]>;

/* ---- Unified leaderboard pins (agora-0123 — the board is TYPED since
 *      0.12.33; the console's parity note got it the 0121 treatment) ---- */
import type { HubCategoryCell, HubReputationRow } from "./hub_client";
type ServedEntry = Schemas["LeaderboardEntry"];
type _pin_lb_target = Readable<ServedEntry["target"], HubReputationRow["target"]>;
type _pin_lb_score = Readable<ServedEntry["score"], NonNullable<HubReputationRow["score"]>>;
type _pin_lb_raters = Readable<ServedEntry["raters"], HubReputationRow["raters"]>;
type _pin_lb_channels = Readable<ServedEntry["channels"], HubReputationRow["channels"]>;
type _pin_lb_cell = Readable<Schemas["CategoryCell"], HubCategoryCell>;
/** Raw uncollapsed global tally (agora-0126, dm#145 ruling). */
type _pin_lb_votes = Readable<Schemas["RawVoteCounts"], NonNullable<HubReputationRow["votes"]>>;

/* ---- Tally shape pin ---- */
/** The pure overlay fold consumes exactly the served RatingTally. */
type _pin_tally = Readable<Schemas["RatingTally"], { up: number; down: number; mine: number }>;

/* ---- Search pins (agora-0132, hub ≥ 0.12.44 `search-grouped`) ---- */
/** SearchHit is a SIBLING of MessageRow: shared field names must stay
 *  read-compatible or the "renderers keyed on field names work for free"
 *  premise silently breaks. NO body and NO score are contract facts —
 *  their ABSENCE from the served schema is pinned below. */
import type { HubSearchHit, HubSearchReport, HubSearchSection } from "./hub_client";
type ServedHit = Schemas["SearchHit"];
type _pin_sh_kind = Readable<ServedHit["kind"], HubSearchHit["kind"]>;
type _pin_sh_channel = Readable<ServedHit["channel"], HubSearchHit["channel"]>;
type _pin_sh_ref = Readable<ServedHit["ref"], HubSearchHit["ref"]>;
type _pin_sh_title = Readable<ServedHit["title"], HubSearchHit["title"]>;
type _pin_sh_created = Readable<ServedHit["created_at"], HubSearchHit["created_at"]>;
type _pin_sh_snippet = Readable<ServedHit["snippet"], HubSearchHit["snippet"]>;
type _pin_sh_highlights = Readable<ServedHit["highlights"], HubSearchHit["highlights"]>;
type _pin_sh_seq = Readable<ServedHit["seq"], HubSearchHit["seq"]>;
type _pin_sh_sender = Readable<ServedHit["sender"], HubSearchHit["sender"]>;
type _pin_sh_status = Readable<ServedHit["status"], HubSearchHit["status"]>;
type _pin_sh_ratings = Readable<ServedHit["ratings"], HubSearchHit["ratings"]>;
/** Score/body ABSENCE pin: if the hub ever adds `score` or `body` to the
 *  served SearchHit, these resolve to a key and the equality fails — the
 *  console must then re-decide (bm25 exposure was rejected as a
 *  cross-tenant side channel; body was rejected as a stale-copy source). */
type _absent<K extends string> = K extends keyof ServedHit ? never : true;
type _pin_sh_no_score = _absent<"score">;
type _pin_sh_no_body = _absent<"body">;
type ServedSection = Schemas["SearchSection"];
type _pin_ss_hits = Readable<ServedSection["hits"], HubSearchSection["hits"]>;
type _pin_ss_shown = Readable<ServedSection["shown"], HubSearchSection["shown"]>;
type _pin_ss_total = Readable<ServedSection["total"], HubSearchSection["total"]>;
type ServedReport = Schemas["SearchReport"];
/** All six fixed sections must be readable off the served report. */
type _pin_sr_sections = Readable<
  [ServedReport["decisions"], ServedReport["open_threads"], ServedReport["work"], ServedReport["people"], ServedReport["files"], ServedReport["messages"]],
  [HubSearchReport["decisions"], HubSearchReport["open_threads"], HubSearchReport["work"], HubSearchReport["people"], HubSearchReport["files"], HubSearchReport["messages"]]
>;
type _pin_sr_relaxed = Readable<ServedReport["relaxed"], HubSearchReport["relaxed"]>;
type _pin_sr_cursor = Readable<ServedReport["next_cursor"], HubSearchReport["next_cursor"]>;
/* Semantic-search additions (0.12.51, dm#126): mode_used is served
 * required-with-default — my optional read admits older hubs. */
type _pin_sr_mode = Readable<ServedReport["mode_used"], HubSearchReport["mode_used"]>;
type _pin_sr_coverage = Readable<ServedReport["semantic_coverage"], HubSearchReport["semantic_coverage"]>;
type _pin_sr_notice = Readable<ServedReport["notice"], HubSearchReport["notice"]>;

/** Force evaluation: a value-level tuple of the pins above — if any pin
 *  resolves to `never`, this line fails to typecheck. */
export const HUB_CONTRACT_PINNED: [
  _pin_id, _pin_channel, _pin_seq, _pin_sender, _pin_kind, _pin_status,
  _pin_urgency, _pin_critical, _pin_to, _pin_title, _pin_body, _pin_reply_to,
  _pin_created_at, _pin_has_resolved_reply, _pin_retracted, _pin_retracted_at,
  _pin_pending_asks, _pin_ratings, _pin_read, _pin_cast_rating, _pin_tally,
  _pin_lb_target, _pin_lb_score, _pin_lb_raters, _pin_lb_channels, _pin_lb_cell,
  _pin_lb_votes,
  _pin_sh_kind, _pin_sh_channel, _pin_sh_ref, _pin_sh_title, _pin_sh_created,
  _pin_sh_snippet, _pin_sh_highlights, _pin_sh_seq, _pin_sh_sender,
  _pin_sh_status, _pin_sh_ratings, _pin_sh_no_score, _pin_sh_no_body,
  _pin_ss_hits, _pin_ss_shown, _pin_ss_total, _pin_sr_sections, _pin_sr_relaxed, _pin_sr_cursor,
  _pin_sr_mode, _pin_sr_coverage, _pin_sr_notice,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];

/** The hub's capability ledger names this semantic when the rating verb is
 *  live (`whoami.semantics`, also stamped in the openapi artifact's
 *  x-agora-semantics). The console's try-then-latch gate covers the
 *  old-proxy case whoami cannot see, but the constant is pinned here so a
 *  rename lands as a visible diff, not a silent miss. */
export const MESSAGE_RATINGS_SEMANTIC = "message-ratings";

/** Unified-score semantic (operator rulings dm#129/131): boards serve
 *  {score, breakdown} with per-message `general` + per-colleague named
 *  categories. The console dual-reads (legacy total/axes/messages against
 *  older hubs) and retires the legacy reader after the hub ship settles. */
export const UNIFIED_SCORE_SEMANTIC = "reputation-unified-score";

/** Grouped-search semantic (agora-0132, hub ≥ 0.12.44): GET /search serves
 *  the six-section membership-scoped report. The console's try-then-degrade
 *  gate covers pre-search hubs; the constant pins the capability name. */
export const SEARCH_GROUPED_SEMANTIC = "search-grouped";
