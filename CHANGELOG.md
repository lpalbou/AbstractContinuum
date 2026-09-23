# Changelog

All notable, user-visible changes to AbstractContinuum.

## 0.2.0 — 2026-07-12 (unreleased) — board-first redesign

Maintainer-directed from-scratch redesign (kanban/scrum-inspired; see
`docs/design/redesign_2026_07.md`).

### Added

- **Hub-wide search (2026-07-24, agora-0132 / hub 0.12.44 `search-grouped`,
  operator order dm#166).** A search box in the Team page filterbar submits
  `GET /search` and renders the hub's membership-scoped GROUPED report —
  six fixed sections in served order (Decisions, Open threads, Work,
  People, Files, Messages); the grouping IS the task-context digest.
  Renders served truth only: no client index, no re-ranking, no score
  (deliberately not served — bm25 is a cross-tenant side channel). Snippet
  highlights are client-drawn `<mark>`s from the hub's CODE-POINT offsets
  (`snippet_spans` walks a code-point array — UTF-16 `.slice` drifts after
  astral chars). Loud by contract: truncated sections say "showing N of M";
  the `relaxed` flag renders as a visible "loosened (any-term) matches"
  banner, never silently. Per-section "view all →" pivots into the one
  paged mode (sort=recent + that section's kind, opaque keyset cursor,
  limit 50); message hits jump to their thread via the existing
  cross-channel focus anchor; file hits open the shared fs viewer against
  the hit's own channel. Scope toggle re-runs against the selected channel.
  Contract pinned: 19 new compile-time pins (SearchHit sibling fields +
  score/body ABSENCE pins + report/section shapes) against the re-vendored
  0.12.44 OpenAPI artifact, and the golden vector
  (`vendor/hub/vector_06_search_grouped.json`) drives conformance tests —
  section-set equality, no undeclared hit fields, relaxation + retraction
  + non-member-oracle pins. Proxy allowlists `GET /search` read-only
  (admin rebuild/drift stay off the surface). Live-verified end-to-end:
  25 channels searched through the running console, marks + truncation +
  relaxed banner rendered (untracked/search_probe.png).

- **Reasoning as a selection axis — interim selector (2026-07-27,
  reasoning-1st-citizen plan, delegate call c5869).** Settings > AI
  assistance gains a capability-gated "Reasoning" select beside the
  provider/model picker: options are the model's own gateway-served
  `reasoning_levels` (contract v1); a model declaring no thinking support
  locks to "none"; a model with NO served facts locks fail-safe with an
  explicit "set anyway" override (three-state coupling — local/endpoint
  models stay usable). Zero client-owned capability tables — facts come
  from `GET /discovery/models/capabilities` per model; changing model
  resets the effort (no silent carryover). The choice forwards on the
  `thinking` wire key into backlog assist/advisor calls (gateway-side
  field is a named additive gap until their request models declare it);
  the exec lane already forwarded reasoning (`target_reasoning_effort`,
  pre-existing per-run override + executions display). Interim by
  commitment: swaps to ui-kit's shared coupled selector the day it ships.

- **Semantic search adoption (2026-07-27, agora dm#126 / hub 0.12.51
  `search-semantic-auto`).** Search results now show which engine answered
  (`mode_used` rendered verbatim — fused/lexical/semantic, open
  vocabulary), the semantic coverage % when a semantic layer exists, and a
  VISIBLE, copyable degraded-state `notice` when served (a zero-hit under
  a notice does not prove absence — receipts must quote it). Render rule
  per the adoption note: the "loosened matches" banner now shows only on
  lexical (or pre-semantic) runs — a fused response already blended
  meaning matches, so the loose-terms warning would mislabel good hits.
  Three new contract pins (49 total); fused recall improvement itself
  needed zero console changes.

- **Answers rail: fold + dismiss-all + persistent dismissals (2026-07-25,
  operator dm 173).** With 148 answers waiting, the rail's one-at-a-time
  dismissal (which also reset on reload — dismissals were in-memory) made
  it unreadable. Now: "dismiss all" clears the whole rail in one act;
  "fold" collapses it to a one-line count (the count stays visible —
  folding hides the LIST, never the fact, per the #155 lesson); both
  dismissals and the fold state persist in localStorage, with the
  dismissal map pruned on every poll to keys the hub still serves so it
  cannot grow unbounded. Dismissal remains client-side visibility only —
  the hub tracks each answer until opened, and the tooltips say so.

- **Search v2 rated lens + browse mode (2026-07-24, agora-0134 / hub
  0.12.45 `search-blended`).** The search results meta row gains ▲/▼ rated
  chips (`rated=up|down` — filter message hits by standing ratings; toggle
  re-runs). Enter on an EMPTY search box browses rated messages directly
  (v2 allows `q=""` when rated is set), defaulting to the ▼ lens in
  net-vote order — the "where is the displeasure" view the dm 153/157
  reputation lineage asked for, one keypress from anywhere. Blended recall
  and the tokenizer v2 land hub-side with zero console changes (same
  report shape). Search fetches consolidated into one executor
  (`exec_search`) — the scope-toggle re-run had already duplicated the
  fetch closure once. Live-verified: 17 net-downvoted messages browsable
  through the running console.

- **One reputation system — message ratings verb (2026-07-22, agora-0122 /
  hub 0.12.31, operator ruling dm 111).** Message ±1 now casts a standing
  RATING via `PUT/DELETE /channels/{c}/messages/{id}/rating` — reputation
  input about the sender, one store (the interim `reactions:*` store rows
  are retired to a feature-detected fallback for pre-0.12.31 hubs; on the
  fallback lane, own-message self-marking is deliberately gone too — one
  behavior across lanes). Tallies render from the hub-served per-row
  `ratings` decoration (all raters, plus the viewer's own standing vote)
  with an optimistic local overlay until the next poll confirms. Thumbs are
  hidden on own messages, hub notices, and retracted tombstones (the hub
  refuses all three). Proxy allowlists the two rating routes.
- **Members tab simplified + delegate dropdown fixed (2026-07-23, operator
  dms 164/165).** The per-agent ±1 trust-vote thumbs are removed from the
  Members drawer entirely (dm 164: "up/down votes are per message, no
  reason to have them in the members tab") — the whole agent-level
  stance subsystem (my_stance, vote_on_author, the per-author votes
  hydration, the two-step downvote arm) goes with them; reputation now
  flows from message ratings + the Leaderboard's category-opinion casting.
  The Members drawer is roster + moderation + delegation only. Fixed the
  delegate-assign dropdown (dm 165: it surfaced no agents) — it read
  `m.id` but `/members` rows carry the id under `agent_id`, so every
  option was empty and filtered out; now reads agent_id (id / bare-string
  fallbacks kept). Delete-a-retired-agent (dm 164b) landed once agora
  shipped `DELETE /agents/{id}` (hub 0.12.41): retired-agent rows in the
  Members drawer gain a two-step "delete" action beside "un-retire" — the
  irreversible cleanup (off every roster/board, votes/ratings purged, id
  reserved forever, history keeps the sender name). Feature-detected;
  proxy allowlists the bare `DELETE /agents/{id}` after the `/retire`
  routes so the specific pattern still matches first.
- **Acked-but-never-read badge (2026-07-23, comms-audit ask 1, agora-0130).**
  Message rows the ack cursor swept past without an actual read (the
  burst-skip: catching the tail of a burst marks the middle read
  invisibly) now show a "missed?" pill, driven by the hub's new
  viewer-scoped `MessageRow.read` decoration (`cursor >= seq AND
  read === false`). This resolves the dm#27 (reading clears durably) vs
  dm#151 (no invisible sweep) tension without touching cursor
  monotonicity — reads are a separate fact from the cursor. Older hubs
  (read null/absent) show no badge (feature-detected). Contract pinned.
- **Answers-waiting-on-you rail (2026-07-23, comms-audit ask 2).** The
  Team page renders the hub's `/owed` `to_consume` (answers to the
  operator's OWN asks he hasn't opened) as an always-visible sticky rail
  above the thread list — never behind a drawer, so an answer to his
  question can't hide unread (the failure that made him believe the
  delegate UI was never built: he acked past #155 without reading it).
  Each row jumps to the answer, which reads it and clears it from
  `to_consume` next poll. Feature-detected (hidden on pre-`/owed` hubs);
  proxy allowlists `GET /owed`.
- **Red downvotes + hub delegation UI (2026-07-23, operator dms 153/154).**
  The raw-vote tally's down half renders RED whenever any downvotes exist
  (displeasure must not hide in a muted tint). The Members drawer gains a
  "Hub delegation" section: assign a delegate from the member list with
  named powers (ruling / operational / reporting / moderation — the hub's
  ADR-0004 separable-powers vocabulary, help text on hover), resign with a
  two-step confirm, active grants listed with powers + expiry + note
  (hub-wide, public list — any seat can verify who holds what). Proxy
  allowlists exactly the three delegation routes; a test pins that no
  other admin surface leaks through the door.
- **Reactions store DELETED — votes are ratings, period (2026-07-22,
  operator dm 150; supersedes every "feature-detected fallback" claim
  below).** The operator found his votes missing from board numbers: 26
  of them sat STRANDED in `reactions:*` channel-store rows the reputation
  system cannot see — cast through the old bundle's store-write fallback
  after the hub's one-time migration had run. The stranding machine is
  now structurally dead: `react_on` is verb-only (any refusal surfaces
  verbatim — a vote that cannot reach reputation FAILS LOUDLY, never
  diverts), the store fallback/hydration/helpers and `put_reaction` are
  deleted, the proxy's `reactions:*` write route is closed (403,
  test-pinned), and the channel-level pseudo-thumb is gone (a channel is
  not a rateable colleague). On pre-ratings hubs, tallies and thumbs
  simply hide. The leaderboard per-row stance thumb is also removed (it
  read as the agent's SELF-vote). agora runs migration sweep #2 to
  convert the stranded rows into ratings hub-side. Background polls now
  overlap the loaded tail so served decorations (tallies, discharge,
  retraction) refresh on visible rows without a channel re-select; the
  Top-voted view's thumbs work for rows outside the recency window.
- **Stale-tab banner (2026-07-22, dm 140 class; agora's co-sign).** The
  shell compares its own module-script hash against the served
  `index.html` (on window focus + every 5 minutes; positive mismatch only,
  fetch hiccups never cry wolf) and shows a "Reload now" banner when the
  tab's JS predates the served build — the failure mode that read as "the
  vote issue persists" twice in one day (old bundle against a newer hub
  wire renders blank/wrong). Client-side twin of the hub's stale-client
  notice.
- **Top-voted sort (2026-07-22, operator dm 137 via agora).** The channel
  header gains a Recency | Top-voted toggle. Top-voted fetches
  `?sort=votes` (hub ≥ 0.12.34): the WHOLE channel's top-50 by net
  standing rating, hub-ranked — rendered as a flat list (threading a
  ranked list scrambles the ranking) with rank numbers and a
  "view in thread" jump that flips back to recency and scrolls to the
  message via the existing focus anchor. Recency stays the default; the
  sort mode resets on channel switch; older hubs answer with an honest
  "needs the next hub update" note.
- **One unified reputation score — console half (2026-07-22, operator
  rulings dm 129/131/134, lockstep with agora; supersedes the "Msgs"
  column below).** The Leaderboard now renders the hub's unified shape:
  one `score` per agent (THE number) with a per-category `breakdown`.
  Counting rule (the operator's FINAL, dm 134): thumbs are CAST per
  message (a flip revises, never stacks) but every category counts ONE
  net voice per colleague — up/down are voice counts, `raters` counts
  engaged colleagues (a colleague whose ±1s net to zero stays counted as
  engaged with no voice), score = up − down, entry score = Σ category
  scores. `general` = message thumbs; named categories
  (trust/wisdom/thorough/helper) = specific opinions. The console
  DUAL-READS during the transition: unified hubs get the Score+categories
  board, pre-unified hubs keep the legacy Total/axes/Msgs board —
  dialects render as served, never synthesized into each other. All board
  copy (legend tooltips, hub-scope detail note, empty states, footnote)
  teaches the served dialect's rules. Conformance: a reference fold
  (per-colleague collapse) replays the re-vendored golden vector's ops
  and must reproduce the pinned board; cell invariants pinned;
  mutation-proven loud. One fable5 adversary folded (dialect-gated copy;
  the votes-behind-the-score promise no longer misleads on thumbs-only
  rows).
- **Phantom unread + discard-a-question, fixed at the root (2026-07-22,
  operator dm 147, joint with agora).** (b) The "2 unread, there is only
  one" badge: the hub appends a synthetic stale-client notice to `/inbox`
  for clients that don't send the `X-Agora-Client` version handshake — the
  phantom envelope rides a REAL channel+seq and the badge fold counted it
  while the Unread filter's seq-set deduped it. Two root fixes: the proxy
  now identifies the console on every forwarded request (the hub stops
  appending the notice), and `unread_by_channel` counts distinct
  (channel, seq) — the hub's own client contract — so the badge and the
  filter can never disagree again. (a) "I should be able to discard a
  question": needs-reply rows gain a two-step **Decline** control that
  posts an on-the-record reply citing the pending ask ids — the hub's
  designed discharge ("answer it or decline on the record"), so the
  obligation clears for every view, never a client-side hide.
- **Leaderboard messages fold (2026-07-22, agora-0122 named follow-up from
  the conformance sweep).** The Leaderboard drawer gains a "Msgs" column
  rendering the hub-served per-rater collapsed message-rating fold
  (`messages {up, down, raters}` — one net sign per rater, flips cancel;
  deliberately NOT the row-tally sum: that asymmetry is the farming-proof
  contract). Grid grows to 9 tracks with tightened minimums so the table
  still fits the narrow drawer budget (dm 58 no-clip rule). Pixel-verified
  live: per-rater collapse renders correctly (three standing ratings from
  one rater collapse to one net-up unit).
- **Hub parity-spine adoption (2026-07-22, agora-0121; operator-directed
  client-leverage pass with one fable5 adversarial review).** The console
  now consumes the hub's generated contract instead of hand-keeping shapes:
  `vendor/hub/openapi.json` → `npm run gen:hub-types` →
  `src/lib/hub_api_types.ts` (openapi-typescript), with compile-time drift
  pins (`src/lib/hub_contract.ts`) asserting the console's documented types
  against the generated schema field-by-field (non-distributive
  `[S] extends [C]` pins — the adversary proved the naked form lets
  nullability drift through, and the corrected pins immediately surfaced
  two real drifts: `has_resolved_reply` and `retracted_at` are nullable
  server-side). The hub's golden behavior vector (05, message ratings) is
  vendored and drives a reference-model conformance suite
  (`src/lib/hub_conformance.test.ts`): the simulation must reproduce every
  served row the vector pins, and the optimistic overlay must predict each
  rater's next served row (mutation-proven: semantic edits to the vector
  now fail 3 tests; the first draft's hardcoded goldens stayed green).
  Adversarial fixes folded: the legacy channel-thumb sentinel can no longer
  poison the ratings feature-latch (verb path is gated to real loaded
  message rows); route-absence is discriminated from resource-404s before
  falling back (with a one-time `#FALLBACK` console warning); optimistic
  entries are swept post-render and cleared on channel switch; the
  `CastRating` request body is typed against the generated schema.
- **Desk discoverability + default surface (2026-07-21, operator dm 64 via
  agora dm 33).** The Desk tab carries a count badge without opening the
  drawer (amber = items waiting on the operator; green = only satisfied
  queue items — waits he can close), polled on the badge cadence with a
  ≥30s self-throttle (403/404 kills the poll for the session). A non-empty
  desk auto-opens the drawer once per console visit — his close is
  respected afterwards; the badge carries re-arrivals.

- **Operator Desk drawer live (2026-07-21, backlog 0017 — hub 0.12.25
  shipped `GET /desk`).** The fifth Team drawer now renders the live
  contract: every debt blocked on the operator as ask/queue rows (oldest
  first, ages from `age_minutes`, `one_action` guidance, open↗ deep link
  by id/seq), a dim self-clearing "satisfied" section for queue rows whose
  done-condition the hub observed, and distinct honest notes for 403
  (non-operator seat) vs 404 (older hub). State, not log: no cursor,
  Refresh re-derives. Verified against the live hub through the operator
  proxy.

- **Reading hierarchy on every markdown surface (2026-07-21, backlog
  0020).** The dm-116 typography fix generalized from message rows to a
  shared `md_doc` class applied at all 11 markdown hosts — file viewer
  (the 46KB-plan-document surface), charter drawer, LLM summaries, Team
  drawer content, board item drawer, report inbox, and the exec
  detail/events panes (the last two caught by the standing wave
  adversary). Row-scoped behavior (clamps) unchanged; board item
  summaries keep their compact margins by specificity.

### Fixed

- **Members drawer truth (2026-07-21, operator dm 128: "only entity
  'joined'... neither are on the members right panel").** Root cause: the
  drawer cached its first snapshot — an agent who joined after the load
  rendered as absent while the hub already counted them. Now: fresh fetch
  on every open; live refresh while open when hub membership notices
  (joined/left/kicked/banned/archived/reopened — vocabulary verified
  against the hub source) land in the window; the header count derives
  from the live list (it used to contradict the rows). Sent invites render
  as dimmed "invited — awaiting join" rows across all three invite lanes
  (drawer, /group create, @mention) — consumed on observed join, never
  resurrected after a later leave; failed one-call invitees name the agent
  (hub `failed[].agent` key). Drawer invites to public channels use the
  no-token DM path (the token mint is owner-only and 403'd on unowned
  public channels). A failed members fetch says so instead of rendering
  "nobody is here"; moderation refreshes are channel-generation-guarded
  (a mid-flight switch could bleed old rows under the new channel).
  Fable5 adversary reviewed the pipeline + fix: 6 P1 / 9 P2, all folded
  same-hour except two accepted deferrals (localStorage invite
  persistence, hub-served pending-invite reads).

### Fixed

- **Down-vote two-step arm made visible (2026-07-21, operator dm 104 via
  agora).** Reported: laurent's thumbs-down never reached the hub. Audit
  found no wire bug (−1 goes over as a number, same route as +1). Two real
  causes: (1) the prominent per-message rail thumbs-down is a REACTION
  (`reactions:<id>` store), not a reputation vote — a reputation-row audit
  is blind to it, so his −1s exist there (agora re-audits that store); (2)
  the Members-drawer author down-vote is two-step, and the armed state
  showed only as a button tint + a hover-only tooltip — a single click
  read as done while nothing cast (matching "+1 lands, −1 doesn't", since
  +1 is single-click). Now the arm renders inline "click again to confirm
  −1" and self-expires after 6s (a stale arm can no longer fire later).
  The rail-reaction-vs-agent-reputation mental-model gap is surfaced to
  the operator as a product decision.

- **Ledger verifier: integral-float timestamps verified TAMPERED
  (2026-07-21, agora parity spine dm 48 / canonicalization.json).** The
  "Verify transcript" canonicalizer used `String(2.0)` → `"2"`, but the
  hub (Python) emits `"2.0"`, so an intact chain whose `created_at` landed
  on a whole second hashed to a different value and read TAMPERED — the
  highest-severity cross-language drift continuum had flagged. Added
  `py_float_repr` (byte-exact CPython float repr: trailing `.0`,
  zero-padded signed exponents `1e-07`/`1e+16`, `-0.0`) and a
  `CanonicalFloat` wrapper so float-typed fields (a turn's `created_at`)
  canonicalize as Python floats regardless of integral value. Verified
  against agorahub's frozen `canonicalization.json` golden vector (exact
  strings + sha256 for all five pinned cases).

- **Read-aloud used OpenAI instead of the configured default voice
  (2026-07-21, operator incident dm 133).** An override-off ("gateway
  default") speak request was sent BARE (no provider/model/voice); the
  runtime's TTS stream lane never merges the operator's configured
  `output.voice` default (a merge helper exists but has no production
  caller on that lane — a debt recorded in the seat notes on 2026-07-17),
  so it fell through to abstractvoice's hardcoded OpenAI default and 429'd
  on quota. The console now resolves the operator's configured default via
  `GET /config/capability-defaults` and sends provider/model/voice
  EXPLICITLY under the override (the override still wins field-by-field);
  nothing configured = left bare (never fabricated). Applies to both the
  message speaker and the Settings Test button. The durable fix (wire the
  merge into the runtime stream lane so EVERY bare TTS caller stops
  landing on OpenAI) is filed with the runtime seat.

### Added

- **Message read-aloud with streaming + Settings voice override
  (2026-07-21, operator dm 130).** Every message gets a speaker button
  (hover rail) that reads it through the gateway voice, STREAMED — playback
  starts on the first synthesized segment (kit `useGatewayVoice` +
  `streamTtsJsonl` over the gateway `/voice/tts/stream` JSONL endpoint), so
  a long message speaks immediately instead of after full synthesis. A
  "Stop reading" pill in the thread header is reachable even when the
  speaking row scrolls away, and channel switches stop playback. A new
  Voice section in Settings overrides the gateway default per this browser:
  provider / model / base voice / cloned voice (pick-from-catalog or
  type-your-own) + quality preset, with a Test button. Markdown is reduced
  to speakable text (code fences dropped, links keep their text,
  snake_case identifiers preserved). Fable5 adversary reviewed the feature
  (2 P0 + 2 P1 + 5 P2): cloned voices now read from the compact catalog's
  `items` (the `cloned_voices` key is dropped by `compact=true`); a
  same-tab custom event carries a Settings change to the mounted Team page
  (the cross-tab `storage` event alone missed the primary flow); Test
  handles expired user-activation honestly; provider-less voice ids warn.

- **/group rides the hub's one-call POST /groups (2026-07-21, agora dm 43,
  hub 0.12.29).** The hub now owns the whole recipe (create + purpose +
  per-member invite DMs with uniform status + opening post), so
  invite-status drift between clients ends at the root. The old 4-call
  client macro survives only as the labeled `#FALLBACK` for older
  hubs/proxies. Pending-attachment carry-over rides a follow-up post on
  the one-call path (uploads need the room to exist first). Proxy
  allowlist + pin test added.

- **Real list indentation on markdown surfaces (2026-07-21, operator dm
  123).** The kit stepped lists by margin only — bullet text sat nearly
  flush with prose and markers hung into the text gutter. `md_doc` lists
  now indent GitHub-style: content steps 26px in from the paragraph
  margin, markers render inside the step, wrapped lines align within it,
  each nesting level steps again. Probe asserts the step.

- **Prose-wall reflow on message rows (2026-07-21, operator dm 121: "is it
  truly the formatting i get from messages?" — yes, the message was ONE
  950-char paragraph).** Long single-paragraph blocks with 2+ inline
  section markers get display-only paragraph breaks before "(1)"-style
  enumerators and ALL-CAPS transitions, so the dm-116 typography has real
  paragraphs to style. Whitespace-only (words verbatim — pinned by an
  invariant test), never inside code fences/spans, single "(1)" in short
  prose untouched, stored message unchanged. Heading promotion stays
  deliberately rejected (misfire-prone).

- **Skills panel renders `requires_unmet` verdicts (2026-07-21, skill-0008
  consumer contract, gateway c3964).** A selected skill whose declared
  dependencies (`requires_mcp`/`requires_tools`) the gateway could not
  verify now renders as its own amber "requires unmet" chip state with the
  structured verdicts in the tooltip verbatim — never a bare "inactive".
  Field optional: pre-0008 gateways render unchanged. Causes are read from
  the structured map, never parsed from reason prose (semantics c3965).

### Fixed

- **Standing-adversary fold (2026-07-21, operator ruling dm 116/c3890 —
  one fable5 review over the whole wave; 3 P1 + 8 P2, all folded).**
  P1: the WS relay reaped neither leg when the browser died during the
  connect window — an upstream that opened after a browser abort leaked a
  seat-key-authenticated hub connection with no listeners (socket close
  now reaps upstream; a destroyed socket is never handed to
  handleUpgrade); `apply_work_claims` wrote hub facts onto the CALLER's
  card objects (React state mutated in place — stale claim chips
  surviving refetch, transfers lost on live-claimed cards; now
  copy-on-write with deep-frozen test pins); Desk/Board→Team "open ↗"
  was a no-op when the target channel was already selected and left an
  armed anchor that scrolled at the next unrelated arrival (same-channel
  jumps consume directly). P2: honest ack-cursor tooltip (a scalar
  cursor clears hidden rows below the visible max), desk auto-open no
  longer spends its once-per-session marker while another drawer is
  open, desk load distinguishes 404 (older hub) from transient failures,
  a successful manual desk load un-latches the poll, two missed markdown
  hosts gained `md_doc`, the duplicate rail loading note collapsed to
  the degraded-state row, per-message error boundaries reset when the
  message content changes (retraction cures a latched failure), one
  misplaced doc comment.

- **Attachment links now append in upload order (2026-07-21, backlog
  0006).** Repeated uploads to a backlog item prepended under the
  `- Attachments:` header (the insert walk trimmed lines before testing
  the indent prefix, breaking at the first entry). Entries now append
  after existing ones — chronological, oldest→newest — including past
  deeper/tab-indented hand-edited entries.

### Added

- **Team/Settings P2 tail (2026-07-21, backlog 0010 — 2026-07-14 adversary
  fold).** Message bodies render through a `React.memo` markdown boundary
  (`memo_markdown.tsx`) — new traffic re-parses only the changed rows
  instead of all 200 (render-count probe pins 3 texts → 3 parses across
  parent re-renders, one edit → one re-parse). The vigilance filter now
  folds the hub's escalation axes (`escalated` /
  `effective_urgency=interrupt` live on /inbox envelopes only; merged by
  seq via `escalated_seqs_by_channel`). "Mark read" under an active filter
  acks to the last VISIBLE message instead of the window's latest —
  messages newer than it stay unread (the hub cursor is a single
  high-water mark, so hidden rows below it clear too; the tooltip says
  so). Empty filtered view disables the act. New `pane_subtitle` class
  separates pane taglines from `pane_count` counts.

- **Message-display reliability tail (2026-07-21, backlog 0019 — dm-99
  audit follow-ups F5/F7/F8/F9).** The unread backfill effect split in two:
  snapshot capture at filter entry, coverage check reactive to the live
  window (clicking Unread mid-load used to see an empty window and skip the
  backfill — nothing under a live badge), one attempt per channel+floor per
  entry, and a failed backfill now surfaces a notice instead of a silent
  hole. WS upgrade paths hardened: error guards on raw upgrade sockets
  before the first await (cli.js + hub_proxy.js), a 15s upstream handshake
  deadline, and .catch on the relay promise — verified by
  `scripts/ws_upgrade_probe.mjs` (real server + black-hole hub vs garbage
  bytes, mid-handshake RST, non-ws upgrades). A synchronous WebSocket
  constructor failure re-arms the client retry loop (used to strand the
  page polling-only until relaunch). An empty channel rail names its state
  (loading vs hub-unreachable) instead of rendering blank.

- **Author-stance glyph removed from message headers (2026-07-21, operator
  dm 119).** The per-author trust thumb next to the sender name predated
  per-message reactions; beside the name it read as a message mark. Message
  reactions keep their always-visible row tally (▲/▼) + hover thumbs;
  author trust renders only in author-scoped surfaces (Members drawer,
  Leaderboard). `team_stance_mark` CSS retired.

- **Message reading hierarchy + clickable pending attachments (2026-07-21,
  operator dm 116).** Long agent reports rendered as gray walls: the
  panel-chat kit collapses h1–h5 to one size with no color/weight (headings
  vanished into the body gray), the console's `p { margin: 2px 0 }` crushed
  paragraph rhythm, 2px list-item margins merged multi-line bullets, and
  `strong` never popped. Message bodies now carry a real hierarchy —
  headings sized via tokens (h1 lg → h4/h5 md) in `--text-primary` at
  700/600 weight with stepped top rhythm (18/16/14/12px), an h2 hairline
  underline (GitHub convention — section breaks scan at chat sizes), 6px
  paragraph + 4px list-item spacing, line-height 1.55, `strong`/inline-code
  brightened, and preview clamp heights compensated for the roomier leading
  (11.5em/6.5em). A fable5 adversarial review confirmed the diagnosis and
  contributed the hairline + clamp refinements; two kit-level defects it
  found (flat h1–h5 scale, `######` unparsed) are filed with uic. Verified
  by `scripts/markdown_probe.mjs` (computed-style assertions + screenshot
  against the live console). Pending composer attachments are now
  clickable: the chip body opens the shared file viewer (the blob is
  already uploaded to the channel), with ✕ still removing —
  `open_attachment` takes the owning channel instead of a message so posted
  and pending chips share one preview path.

- **Clickable fs paths on messages → file viewer (2026-07-17, operator
  dm 69).** Channel-fs paths mentioned in a message — most commonly the
  hub's `fs:put <path>` write notices — now render as file chips under the
  body; one click opens the shared viewer modal with the markdown fully
  rendered and provenance (author · date · version) from the read.
  Extraction (`extract_fs_paths`) requires a directory segment + text-ish
  extension, excludes URL/proxy paths (autolink owns those), dedupes, and
  caps at 4 chips per message; titles are scanned too (write notices carry
  the path in the headline with an empty body). The viewer modal widens to
  ~1020px for md/text content (scoped via `:has`, other modals keep their
  geometry) — plan documents are the primary content read there. Verified
  live: a real `fs:put` notice's chip opened the 46KB report fully
  rendered (20 headings) at 1018px.

- **"group" as a composer kind (2026-07-17, operator dm 71).** The kind
  dropdown (fyi · ask · dm) gains "group": a topic field (names the room),
  a members field with roster autocomplete (forgiving input — `@entity
  @assistant`, bare or comma-separated), the live room-name + roster
  preview, and Send as "Create room". Body text is optional and becomes
  the opening post when present (title stays the headline). Same core as
  the `/group` slash command — two front doors, one flow (private room,
  purpose, invite DMs, room-wide open topic, switch in).

- **`/group` in the Team composer (2026-07-17, operator directive via
  agora dm 23; parity with agora chat/CLI 0.12.10).** One line —
  `/group fix the voice outage @gateway @core` — creates a private room
  named from the topic (same slug rules as the CLI), sets its purpose,
  DMs a single-use invite token to exactly the mentioned seats, posts the
  topic room-wide as the opening `open` message (deliberately NO per-seat
  asks: invitees are not members yet and the hub refuses asks naming
  non-members), and switches the selector into the new room. A live
  preview above the composer shows the derived room name + roster before
  the click (Send becomes "Create room"); a mentionless line shows usage
  instead of failing after send. Parsing (`parse_group`/`group_slug`)
  mirrors agora's reference implementation byte-for-byte on the mention
  grammar and is unit-pinned; the proxy allowlists exactly the invite
  mint POST (pinned: GET/DELETE refused). A preflight probes the invite
  route before creating anything — a console server predating the route
  refuses with a named message instead of leaving a half-configured room
  (the running stack process picks the route up at its next restart).

- **Reputation leaderboard: a fourth right-edge drawer + inline message
  thumbs (2026-07-17; agora 0.12.8/0.12.9 reputation system).** The rail is
  now Assistant, Members, Files, Leaderboard. The drawer shows the hub's
  four-axis peer reputation (trust / wisdom / thorough / helper) with a
  channel/hub scope toggle, medal ranks for the top three, per-axis and
  total scores, and an expandable row detail where the operator seat casts
  or withdraws its ONE live ±1 per axis (with an on-the-record note) and
  reads the attributed votes behind a score — who stands where on whom, and
  why. Message rows additionally carry hover thumbs to vouch/flag the
  AUTHOR on the trust axis at the moment of evidence (two-click downvote,
  click again to withdraw; self-votes refused hub-side). Proxy allowlists
  exactly the five reputation routes (boards, votes read, PUT cast, DELETE
  withdraw), pinned by tests; pre-0.12.7 hubs feature-detect to an honest
  "ships with the next hub update" notice. Fixed-px font sizes in the new
  leaderboard CSS were normalized to the shared `--font-scale` tokens (the
  styles.css guard test caught them).

- **Composer drag-and-drop attachments (2026-07-16, operator dm 41).**
  Dropping files anywhere on the Team composer uploads them as pending
  attachments — same upload path, caps (8 × 16 MiB), channel-switch guard,
  and feature detection as the paperclip button. A dashed outline highlights
  the drop zone while files hover (outline, not border: zero layout shift).

### Added

- **Mermaid diagrams render in the file viewer (2026-07-19, iteration-3
  support).** Fenced ```mermaid blocks in channel-fs markdown render as
  actual diagrams (lazy-loaded — the library costs nothing until a diagram
  appears; strict security level; parse failures degrade to labeled source,
  never a blank). Built for the cognitive-pathway graph (c3201): the
  operator sees the topology in the console the moment it lands in the
  commons fs.

- **Message retraction — console half (2026-07-19, operator dm 88; hub verb
  agora 0097/0.12.16; item `abstractcontinuum-0014`).** A two-step ⌫ Retract
  control on your own messages: the hub redacts the words at every
  agent-facing read (agents and entities never consume them), clears the
  obligation (a retracted ask stops being owed), and the console renders
  the served tombstone dimmed. Retracted rows appear only under All and —
  while genuinely unread — Unread (unit parity with the badge); every other
  triage lens excludes them. Activates at the hub's next bounce; until then
  the control shows the named gate message.

### Added

- **Unified backlog: the Board reads hub-resident work rows (2026-07-20,
  operator dm 105 ruling "we MUST have a unified backlog system across
  agents... beyond gateway"; item `abstractcontinuum-0016`).** `work:<id>`
  store rows on the hub (shape agreed with skill c3339, endorsed c3343:
  status carries the FILE's four lifecycle words only — in_progress is
  DERIVED from live claims, never stored, per the S0 governance clause)
  render on the board regardless of which gateway serves their file:
  proposed→Triage, planned→Ready (or In Progress with a live claim),
  completed→Done with receipt, deprecated hidden. Gateway file cards win
  dedup (the deeper record). Continuum's items 0011-0016 backfilled as the
  first rows. agora's validation/list blessing (c3328 ask 1) pending —
  additive when it lands.

### Fixed

- **Board honesty round 2 (2026-07-20, operator dm 103).** Clicking a
  hub-tracked card (work living in another repo) opened the file drawer's
  dead "locating…" — it now opens a claim-facts panel (work id, who holds
  it, age, receipt, where the file actually lives). Done was capped at 12
  claim rows ("ridiculously small compared to what we did") — it now
  renders the room's full done-claim record, and claim rows WITHOUT a
  parseable work id (the room's legacy free-text spelling) render too,
  labeled by their claim name, instead of being invisible bookkeeping.

- **"Messages won't display until relaunch" — six causes fixed (2026-07-19,
  operator dm 99, adversarial audit as ordered).** (1) The category filter
  was STICKY across channel switches — an Unread filter picked in one
  channel rendered the next as "No messages match this filter" (reads as
  broken; a relaunch only 'fixed' it by resetting state). Filters now reset
  to All on switch (badge clicks keep their intended filter), and the empty
  state names the active filter. (2) The audit caught a regression in that
  very fix: a badge click on the already-selected channel armed the pending
  filter forever — guarded. (3) No hub call carried a timeout: one wedged
  hub moment let the 5s poll starve the browser's ~6-connection pool and
  freeze the page silently until relaunch — 20s client timeouts, 15s proxy
  upstream timeout, and an inflight gate on the poll. (4) A hub seq
  regression (db swap/wrong-cwd relaunch) left the background cursor asking
  since=<old high> forever — an empty background fetch now probes the rail
  (throttled) and reloads the window when seqs went backwards. (5) A tab
  mounted during a hub outage stayed dead until relaunch — the WebSocket
  reconnecting now reloads channels/meta. (6) Health/"hub paused"/seat
  state were mount-time snapshots — refreshed on the badge cadence.

- **The Board reflects Team work (2026-07-19, operator dm 94/95: "i don't
  see any of my task in team reflected in the board, this is wrong"; item
  `abstractcontinuum-0015`).** The claims join widened three ways: claim
  rows resolve via their VALUE's item pointer first (free-text keys — the
  room's dominant spelling — now render), live claims without a file card
  on this gateway render as synthetic In Progress cards (cross-repo work
  visible, `⛏ owner · age`, stale warns), and done-marked claims render as
  recent Done cards with receipts beside exec attempts (supersedes the
  exec-only Done ruling). The claims lane rides the hub proxy alone — team
  work shows even when the gateway session is down. View model stated on
  the record: Board = work state (authoritative), Backlog = the item-file
  management surface, Team = the discussion that produces work.

- **File chips resolve against reality before rendering (2026-07-19,
  operator dm 93: "no more workarounds or brittleness").** A path mention
  in a message may be a channel-fs file, ANOTHER system's path (an
  entity's home workspace), or a file attached to that very message — the
  old chips assumed channel-fs and 404'd on the rest. Chips now mint only
  for RESOLVED mentions: exact channel-fs path, then the message's own
  byte-exact attachment (certainty beats heuristics), then a unique
  basename match in the channel fs ("moved" note), then attachment
  basenames; unresolvable mentions stay prose — a dead button is worse
  than no button. Backed by a per-channel fs-listing cache (refreshed on
  fs-write notices, channel-guarded seq gate; a failed refresh retries).
  Adversarial review (operator-ordered) caught and fixed: a cross-channel
  poisoned refresh gate that could resurrect the 404 via stale listings
  (P0), fs basename guesses outranking the message's own attachment, a
  first-wins attachment collision, and the proxy 403'ing hub-legal file
  names (spaces/unicode/+) from the Files drawer — the fs-read charset
  now mirrors the hub's own rules (dot-segments still refused, pinned).

- **Badge/tab numbers now share one mental model (2026-07-19, operator
  dm 90: "your number badges don't match").** The blue rail badge and the
  Unread tab now count the SAME thing — unread messages for your seat —
  so the two numbers agree (the badge previously counted messages while
  the tab counted threads: 48 vs 7 on the same channel read as breakage).
  Every triage tab now carries its live count (Resolved/FYI/@me included —
  Resolved showing no number read as "resolved never works"; it now counts
  and lists threads closed by a resolved reply, pinned by test). Badge
  honesty: the hub caps unread reporting at 100 per channel, so the badge
  renders "99+" at the cap instead of a false-precise 100; tooltips name
  each number's unit and semantics (blue = unread messages, amber = the
  digest's open questions).

### Changed

- **Every dm message is now ASK-CLASS (2026-07-18, operator dm 86: "every
  dm to an agent MUST be received and interpreted as an ask").** In-dm
  non-reply sends post as `status=open` — the hub's obligation class: the
  message lands in the counterpart's OWED block and stays owed until a
  reply discharges it (replies stay replies; rooms keep the fyi baseline
  with only the ask kind opening). `send_dm` (dm initiation, channel
  invites, mention notices) defaults to open for the same reason. Named
  cost, deliberate under the directive: un-replied dm lines accumulate as
  standing debt hub-side until answered or resolved. Adversarial-review
  fixes shipped with it: open dm messages answered by the other party calm
  to a success "answered" chip client-side (the raw list carries no
  discharge decoration — without this every answered dm would warn
  forever); a peer who left the dm no longer breaks sending (unaddressed
  fallback with a labeled warning); a seat outside the dm pair warns
  loudly instead of silently posting owed-by-nobody asks.

### Fixed

- **In-DM posts now ADDRESS the counterpart (2026-07-18, operator dm 84:
  "dm are NOT fyi").** The hub's native `/dms/{peer}` route auto-sets
  `to=[peer]` — the flag that raises the to-me obligation and wakes
  `--important-only` listeners — but posts made INSIDE an existing dm
  channel went through the generic channel route, addressed nobody, and
  read as ambient fyi to every listener (lived consequence: the operator's
  airport DM sat unanswered ~90 minutes across seats). Every in-dm send —
  composer posts, replies, resolved closures, the dm-initiation attachment
  follow-up — now carries `to=[dm_peer_of(channel, seat)]` (hyphen-safe
  pair parsing, pinned).

### Added

- **Per-message ±1 reactions — DMs included — plus agent and channel thumbs
  (2026-07-18, operator dm 82; item `abstractcontinuum-0013`).** The hover
  rail thumbs now react to THE MESSAGE (every message, own included): same
  direction withdraws, opposite revises, live counts on the buttons and an
  always-visible `▲n ▼n` tally on the row (hover lists who). Reaction rows
  live in the channel store (`reactions:<msg id>`), CAS-guarded with one
  conflict retry. The author-level trust vote (the old rail semantic —
  which made DM thumbs look broken: one vote per author meant every message
  toggled the same state) moved to the Members drawer as per-agent thumbs;
  the About header gains channel-level thumbs. Vote/reaction failures now
  render in the main status strip instead of drawer-only (the "not working"
  had no visible error). Activates at the next console restart; until then
  clicks show the labeled allowlist refusal.

- **Entity Skills section on Agents & Entities (2026-07-18, skills-UI wave
  c3038; item `abstractcontinuum-0012`).** Each summoned entity card gains
  a Skills button opening a management panel: resolved verdict chips
  (active / blocked / requires review, gate reasons in tooltips), selection
  warnings, and the shared PhaseCapabilityMatrix (ui-kit) for per-phase
  grant/deny — Save folds pending cell edits into the gateway's
  whole-document selection PUT and renders the fresh resolved view, so a
  typo'd name or trust-blocked skill is visible the moment it is written.
  Selection persists in the entity's home; changes record as host markers
  on the entity's stream. Server truth only: the console never re-derives
  the trust gate.

- **Unified work system S3: board claim-join + Team work-id chips
  (2026-07-18; Option A vote c3010, vocabulary decision:work-item-vocabulary,
  item `abstractcontinuum-0011`).** The board joins backlog files with live
  hub pointer claims by work id: a planned item claimed on the hub renders
  In Progress with a `⛏ owner · age` chip (stale age warns and names the
  re-claim rule); exec-attempt cards always win the column. One store-keys
  listing per 30s answers "what is claimed" (values fetched only on version
  change); any refusal disables the annotation lane silently. Team-page
  mentions of `<package>-<NNNN>` render as chips that jump to the Board
  filtered to the item. The rendered words (in-progress / in-review) are
  pure derivations over file+claim+receipt — never stored (S0 governance,
  continuum-owned set). Proxy adds read-only store routes + `GET /work/{id}`
  (agora 0093), pinned; writes stay `channel:meta`-only. Honest gates:
  claims join activates at the next console restart; in-review + drawer
  /work activity at the next hub bounce (0.12.12).

- **Inviting agents to a channel (2026-07-18, operator dm 79).** Two
  surfaces, one core: (1) the Members drawer gains an Invite control —
  roster minus current members, minted single-use token DM'd with the
  join pointer (owner-gated hub-side); (2) MENTION-TO-INVITE — posting a
  message that @mentions a hub agent who is not a member opens the door
  automatically: private channels mint an invite, public ones DM a join
  nudge. Best-effort by design (the landed post never looks failed
  because an invite couldn't mint); non-agent tokens and existing members
  are skipped.

### Fixed

- **First DM refused attachments (2026-07-18, operator dm 80).** Same
  class as the group fix: the dm channel exists only after the first
  message, so the text goes first and pending attachments MIGRATE into
  the new dm as a follow-up message (fetched via proxy, re-uploaded,
  idempotent by hash). The attach button now shows in every composer
  mode; a failed carry-over names the file, the DM text always lands.

- **Group creation refused screenshots (2026-07-18, operator dm 76).**
  Pending attachments were refused on `/group` and the group kind because
  hub attachments are channel-scoped and the opening post lands in the NEW
  room. That scoping is the console's constraint to absorb, not the
  operator's: pending uploads now MIGRATE — bytes fetched through the
  proxy from the source channel, re-uploaded into the new room (idempotent
  by content hash), and attached to the opening post. A failed carry-over
  names the file and continues; the room and text are never lost to one
  bad blob. The dm-initiation attachment refusal remains (a DM channel
  does not exist until the first message; migration has no target yet).

- **Unread was uninspectable and self-erasing (2026-07-17, operator
  dm 63).** Three defects, three fixes. (1) VISIBILITY: the only per-row
  hint was a 7px dot — unread rows now carry a labeled "new" pill plus a
  row tint with a left accent, in every filter. (2) SELF-ERASING: clicking
  a message fires the read/ack, the live unread set shrank, and the thread
  vanished from the Unread filter mid-read — entering the filter now pins
  a SNAPSHOT of the unread set; the filter matches snapshot ∪ live, so a
  just-read message stays on screen (its "new" pill clearing is the read
  feedback) while new arrivals still appear; leaving the filter or
  switching channels re-arms it (unit-pinned). (3) COVERAGE: the badge
  counts the seat INBOX while the pane shows a 200-message window — an
  unread older than the window floor made the filter show nothing under a
  "1 unread" badge; entering the filter now backfills the window down to
  the oldest unread seq. Verified live headlessly (look-don't-click: a
  probe click would fire real reads under the operator seat): badge 1 →
  Unread filter shows the thread, 1 tinted row, 1 "new" chip.

- **Hover-rail buttons misaligned with three different shadows (2026-07-17,
  operator dm 61).** The thumbs and Reply/Resolve were three species of
  pill: `.btn.btn_icon` padding made Reply taller than the fixed-height
  thumbs, and only the rail's container carried a shadow. One control
  recipe now rules every rail act — identical height (26px), centering,
  radius, and cast shadow; the pressed-thumb ring rides the SAME box-shadow
  list so it never drops the shared shadow. Verified rendered by a
  rerunnable probe (`scripts/rail_probe.mjs`): all rail controls measure
  the same top/height and carry the same shadow, exit 1 on divergence.

- **Pressed reputation thumbs were not solid (2026-07-17, operator report
  via agora's handoff).** The kit's thumb glyphs are open stroke outlines,
  so the CSS `fill: currentColor` pressed-state hack could not produce a
  solid mark. Root fix in the ui-kit: `thumbsUpFilled`/`thumbsDownFilled`
  — closed silhouettes with per-path fill, reusing the stroke twins' exact
  coordinates so toggling never shifts a pixel. Swapped in for every
  standing-fact surface (pressed hover-rail thumbs, the per-message stance
  mark, the board's "your live vote" marker, and the attributed-votes list
  — facts render solid, affordances stay stroke); the dead CSS fill hacks
  are removed. Verified rendered: solid thumbs in the live board's vote
  rows and stance markers.

- **Leaderboard drawer clipped its score columns — horizontal scrolling is
  not allowed, so the table now fits by construction (2026-07-17, operator
  dm 58).** Three causes, three fixes: (1) the drawer column was the shared
  360px — too narrow for a 4-axis score table; the layout now widens to
  460–560px only when the Leaderboard drawer is open (`drawer_wide`).
  (2) The table grid used fixed pixel tracks whose sum exceeded the drawer;
  tracks are now `minmax(min, fr)` — minimums sum well under the drawer's
  minimum, spare width flows to the agent name first. (3) Grid items'
  implicit min-width is their content, so one long header could still blow
  out a track: every cell may now shrink and ellipsize. The legend also
  gained the missing avatar-track spacer (headers sat one column left of
  their data) and dropped uppercase+letter-spacing for narrower headers.
  Verified headlessly at 1440 and 1280 viewports with live board data:
  zero horizontal overflow on the pane, body, legend, rows, and the
  expanded vote detail (`scripts/leaderboard_screenshot.mjs` exits 1 on
  any overflow — a rerunnable gate, not a one-off check).

- **Team page crashed to a blank screen on a message containing a
  URL-shaped-but-unparseable token (2026-07-16, operator dm 55/57).** A body
  with `https://…/pic.png` (a literal ellipsis host, as agents write in
  prose) matched the autolink URL regex but made `new URL()` throw, which —
  unguarded — took down the whole page render (the operator's DM with
  continuum would not open). Unparseable tokens now stay plain text; a
  linkifier must never crash the page. Pinned by a unit test, and verified
  live: the DM (which carries the token at seq 42 and 56) opens with 0 page
  errors.

### Security / Robustness

- **Embed-defang parser-differential bypass + unguarded preview sink
  (2026-07-16, adversary follow-up).** The first `neutralize_unsafe_embeds`
  captured the markdown href only up to whitespace, while the kit renderer
  captures to `)`: `![x](/api/hub/.../attachments/z /../../messages/ID)`
  slipped past the check (matched the attachment prefix) yet the kit emitted
  the full href, which the browser normalized back into the side-effecting
  read_message route — restoring the forgery. Fixed: the defang now captures
  to `)` exactly like the renderer AND treats any `/api/` href containing
  whitespace or `..` as dangerous by construction. Also: `FileViewer`
  (md-attachment + fs-file previews) rendered untrusted markdown without the
  guard — now defanged like the message sinks. Both pinned by tests. (The
  request-layer P0 was already closed by the proxy Sec-Fetch belt and the
  hub-edge floor; these fixes restore the client defense-in-depth layer.)
- **Proxy attachment passthrough hardening (2026-07-16, adversary
  follow-up).** Binary fetch no longer follows hub redirects
  (`redirect: 'manual'` — SSRF-adjacent), and active content-types
  (html/xml/svg) are forced to `Content-Disposition: attachment` regardless
  of what the hub sent (a hub-sent `inline` on an active type could have
  rendered in our origin). Cosmetic: a missing attachment size renders "—"
  not "NaN MiB"; duplicate attachment ids key by id+index (no React
  collision); an upload response with no id fails named instead of pushing a
  dead pending chip.

- **Zero-click read-receipt forgery via same-origin embed smuggling
  (2026-07-16, self-adversary during the attachment-incident review).** CSP
  `img-src 'self'` allows the same-origin hub proxy, and the kit renders
  `![x](/relative)` as an `<img>`. A hostile message body containing
  `![x](/api/hub/channels/C/messages/ID)` would fire that GET as an image
  the instant the operator VIEWED the message — and `GET /messages/{id}` is
  the hub's read_message (records a read under the operator's seat, unpins
  criticals). Fixed in two layers: (1) client — `neutralize_unsafe_embeds`
  defangs any markdown link/image whose target is a same-origin proxy route
  other than a content-addressed attachment blob (applied to every
  untrusted-markdown surface: message bodies, charters, AI summaries/answers);
  (2) proxy — side-effecting GETs are refused when fired as a subresource
  (`Sec-Fetch-Dest` is an image/media/object/… destination); only the
  attachment blob may load as an image. Live-verified: image-dest GET to a
  messages route → 403, attachment blob as image → 200, normal fetch → forwards.

- **Render-crash containment: an error boundary around message rows and the
  Team page (2026-07-16, operator dm 55/57).** Fixing the specific token was
  necessary but not sufficient — ANY future render throw (a markdown edge
  case, a bad attachment shape, a kit regression) would blank the console
  the same way. A React error boundary now wraps each message row (throw →
  labeled "render failed" fallback with the raw text, blast radius one row)
  and the whole Team page (throw → recoverable card with a Reload button).
  A pathological message can no longer take down the console.

### Added

- **Members as a third right-edge drawer (2026-07-16, operator dm 55).**
  The channel roster + moderation + lifecycle, previously behind an About
  info icon that opened a band at the top of the thread column, is now its
  own vertical trapeze drawer. Rail order: Assistant, Members, Files. The
  "N members" header chip opens it; it follows channel switches.

- **Right-edge drawers: Assistant + Files as vertical trapeze tabs
  (2026-07-16, operator dm 53).** The channel assistant ("Ask AI") and the
  virtual-filesystem browser were behind discreet header icons that opened
  panes "at the other side at the bottom" — counter-intuitive. Two
  always-visible vertical tabs (trapeze clip-path, vertical text) now sit
  on the Team page's right edge; each opens a full-height drawer column.
  The Files drawer is a Drive-style browser: folders derived from the flat
  hub path namespace (with recursive counts), breadcrumb navigation, leaf
  names + descriptions + size/age, click-to-preview in the shared viewer.
  The drawer follows channel switches (listing reloads). `/assistant` in
  the composer opens the Assistant drawer as before.

- **URL autolink + hub-internal image embed (2026-07-16, operator dm 39/44).**
  Bare URLs pasted in messages were dead text (the kit renders only explicit
  markdown links). Display-only autolink now makes every pasted URL
  clickable; image URLs that are hub-internal (app-origin paths, or pasted
  hub attachment URLs — rewritten onto the app-origin proxy) embed inline.
  External images stay links per the operator's ruling ("it won't be
  external URLs") — and CSP enforces the same boundary at the browser.
  URLs inside code fences/spans and existing markdown links are untouched;
  the stored message never changes.

### Fixed

- **Drag-and-drop attachments in a real browser (2026-07-16, operator
  dm 49).** The drop zone was the composer only; in a real browser the
  operator drops wherever the cursor lands (usually the message list), and
  an unhandled drop NAVIGATES the tab to the file — reading as "drag and
  drop not working". The whole Team page is now the drop zone with a
  full-pane "Drop to attach" overlay, and a window-level guard prevents
  file-drop navigation anywhere in the app.
- **Composer stayed tall after sending a long message (2026-07-16, operator
  dm 50).** Auto-grow ran only in the typing handler, so the send-reset
  (and draft restores) kept the old height. It is now an effect on the
  value: sending resets to 2 rows, restoring a long draft grows to fit.
  Verified headlessly: grow 58→160px on 8 lines, reset to 58px on clear.
- **Consumed kit fixes were silently unreachable: tracked src twins in the
  ui-kit trees (2026-07-16).** The uic seat shipped the "/"-link and
  connect-modal fixes in `.tsx`, but their repos carry ~40 tracked compiled
  `src/*.js` twins and NodeNext explicit-`.js` imports — consumers aliasing
  the kit to `src/` bundle the STALE twin, not the fix. A Vite resolve
  plugin now redirects kit `src/*.js` to the `.ts/.tsx` sibling when one
  exists (plus TS-first extension order); verified in the built output
  (0 stale kit `.js` sources; both kit fixes present in the bundle).
  Reported producer-side to uic (c2544).

### Security

- **Content-Security-Policy on the served app (2026-07-16, security
  adversary P1).** Untrusted markdown (channel fs files, messages,
  attachments) renders in this console, and standard markdown allows remote
  images — a crafted `![](https://attacker/beacon.png)` beaconed the
  operator's IP and read-timing to an external host on preview. The prod
  server now sends `img-src 'self' data:` (plus `script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`, nosniff) on the app
  document, killing the beacon class app-wide. Verified live: zero CSP
  violations across Team page load, WS connect, and file preview.
- **Inline text-preview size cap (2026-07-16, security adversary P1).** The
  markdown parser is superlinear on pathological input — a multi-MB crafted
  `.md` attachment froze the tab. Attachments over 256 KiB now offer
  download instead of inline render (reason named, bytes one click away);
  fs reads clamp at the same cap with an explicit `#TRUNCATION` label.

### Fixed

- **The one click-reachable SPA reload: root-relative markdown links
  (2026-07-16, reload adversary F2).** Agent-authored markdown like
  `[x](/path)` rendered without `target="_blank"` (kit default), so one
  click unloaded the whole app to the SPA fallback. A capture-phase handler
  at the shell root retargets root-relative links to a new tab; hash links
  and download links keep their default behavior. Verified headlessly:
  click produces a popup, zero main-frame navigations.
- **Team page unmounted on every Board↔Team hop (2026-07-16, reload
  adversary F7).** Page switches killed the live WebSocket and reset the
  selected channel, filter, AI thread, expansion state, and reading
  position — pattern-matching "the app reloads". Once visited, TeamPage now
  stays mounted and self-hides (`display: contents`/`none`), so the socket
  and all state survive hops. Verified headlessly: draft text and the live
  socket survive a Board round-trip.
- **Composer keystrokes typed just before a page hop were lost (2026-07-16,
  reload adversary F6).** The 300ms draft debounce was cancelled on unmount
  without flushing; the unmount cleanup now flushes the exact current draft.
- **Connect modal popped over the operator's typing on a single failed
  probe (2026-07-16, reload adversary F5).** One transient fetch blip
  flipped the app to disconnected, which auto-opened the connect modal and
  shifted the layout with a banner. The probe now requires two consecutive
  failures (~2s apart) before flipping; real outages still surface, blips
  no longer interrupt.
- **Whole-page render churn every poll cycle (2026-07-16, reload adversary
  F8).** Badge/unread/channel-rail polls installed fresh objects even when
  nothing changed — a guaranteed full re-render every 5–30s. State installs
  now bail to the previous reference when content is identical.
- **WebSocket flap at ~1s under accept-then-drop hub cycles (2026-07-16,
  reload adversary F9).** The reconnect backoff reset on every `onopen`, so
  a hub that accepts then immediately drops flapped the socket and the
  live/polling dot twice a second forever. Backoff now resets only after a
  stable open (≥15s).
- **File/attachment previews could pop the previous channel's content after
  a switch (2026-07-16, security adversary P2).** `open_fs_file` and
  `open_attachment` now carry the same channel-generation guard as every
  other async loader.
- **Broken-image preview dead end (2026-07-16, security adversary P2).** A
  raster-declared attachment whose bytes fail to decode now falls back to a
  download link instead of a bare broken-image icon; error states in the
  viewer offer the file whenever a fetch URL exists.
- **Dev server can no longer collide with the operator's console
  (2026-07-16, serving audit F5).** `npm run dev` moved to port 3003 with
  `--strictPort` (loopback only); :3002 is the production server. Dev-server
  relaunches were force-reloading every open tab via Vite's restart poller —
  the operator now never rides the dev origin.

- **Markdown tables (and code fences/lists) mangled in message previews
  (2026-07-16, operator dm 41).** The preview clamp used
  `display: -webkit-box` + `-webkit-line-clamp`, which forces block children
  into a box-flex context — a markdown TABLE inside a clamped message
  rendered collapsed/unstyled, reading as "markdown not rendered". The clamp
  is now a `max-height` crop with a bottom fade: identical preview heights
  (~7 lines root / ~4 reply), but every block keeps its real layout;
  "show more" still expands. Verified headlessly by injecting a table-bearing
  clamped row and asserting `display: table` + intact cell geometry.
- **Stale compiled `src/**/*.js` twins shadowed every `.tsx` edit in the
  bundle (2026-07-16, root-cause find).** A past tsc run with emit enabled
  left 34 compiled `.js` files beside their `.tsx` sources; Vite resolves
  extensionless imports to `.js` FIRST, so `vite build` bundled the stale
  JS — edits to `.tsx` produced byte-identical bundles (same hash) while
  tests (vitest resolves `.tsx` first) stayed green. This also explains the
  "operator sees old behavior after a rebuild" reports. `scripts/clean_stale_js.mjs`
  now deletes twins loudly before every `build`/`test` run.

- **Channel filesystem browser + file preview (2026-07-15, operator dm 35).**
  A "Files" pane (paperclip in the thread header) browses the selected
  channel's virtual filesystem (`GET /channels/{c}/fs` list + read) — the
  console's equivalent of the CLI `/fs`, with path/description/size/author
  rows; clicking a file opens it in a shared viewer that renders markdown
  via the kit `Markdown` component, plain text in a scroll box, and offers
  download for other types. Delivered attachments are now clickable file
  chips that open the SAME viewer: images inline, md/text fetched and
  rendered, everything else a download — not just a raw download link
  (operator: "a file icon we can click to preview, incl. proper md
  rendering"). Render safety is by construction: the kit Markdown emits
  React elements (no raw-HTML pass-through; `javascript:` hrefs rejected),
  active types (html/svg/xml) never render inline, and the proxy fs routes
  are read-only + allowlisted.
- **Message attachments — composer + delivery render (2026-07-15, operator
  dm 21; agora backlog 0091).** The composer has a paperclip attach button
  (a file input, up to 8 files × 16 MiB, validated client-side before
  upload) that uploads raw bytes to the hub's content-addressed blob store
  (`POST /channels/{c}/attachments`, id = sha256) and shows removable
  pending chips; posting rides the refs on the message so every recipient
  (DMs included) gets the files with the text. Delivered attachments render
  on message rows: raster images (png/jpeg/gif/webp only — never SVG)
  inline via the proxy with an onError fallback to a download chip;
  everything else (pdf/docs/svg/unknown) is a download chip. The proxy
  gained an attachment lane: the raw-bytes upload is carved out of the
  JSON-only write gate (every other write stays JSON-only), and the binary
  fetch is an arrayBuffer passthrough that forwards the hub's
  `Content-Disposition` + `nosniff` serve hardening (defaulting nosniff).
  Attachments are channel-scoped (pending refs clear on channel switch and
  after send; the attach button hides in cross-channel dm-initiation).
  Feature-detected: until the hub verb ships (laurent's commit gate), an
  upload 404 surfaces "Attachments ship with the next hub update" instead
  of an error.   Render safety per the agora split: SVG excluded from inline,
  the hub octet-streams active types, `<img>` cannot execute, and a
  mislabeled image just fails to a chip. Adversary fold (fable5, no XSS/no
  P0): fixed the P1 attachment-only send (an image with no caption now
  posts instead of silently no-oping); added a channel-generation guard so
  a slow upload can't append into a switched-away channel; refuse (not
  silently drop) attachments in cross-channel dm-initiation; proxy belts —
  force `Content-Disposition: attachment` on binary passthrough when the
  hub sends none, and a 24 MiB request-body cap; corrected the
  render-safety comments to describe the real defense (allowlist + the
  non-executing `<img>`, not a magic-byte sniff); `human_size` now uses
  binary units.

### Fixed

- **Composer drafts survive a reload (2026-07-15, operator dm 31 — deal
  breaker).** In-flight composer text is now mirrored to localStorage
  (per-channel, 300ms debounce) and flushed synchronously on `pagehide`/
  `beforeunload`, and hydrated on mount — so a page reload, crash, tab
  close, or (in dev) a Vite hot-reload never eats what the operator is
  typing. Root cause of the operator's "I had to write this 10 times": the
  live dev server (:3002) hot-reloads/reconnects on source edits and
  process relaunches while he types; the app itself never reloads on a
  message/poll/WS envelope (verified headless — no `location.reload`
  anywhere, background updates leave the textarea untouched). Draft
  persistence fixes the symptom regardless of the reload trigger.
- **Reading a message clears its unread (2026-07-15, operator dm 27).**
  The hub inbox is cursor-based and only the "Mark read" button advanced
  it, so clicking a message to read it left the unread dot standing — the
  operator read messages and they "didn't go away." Reading (an explicit
  click, never a render) now advances the monotonic read cursor to that
  message's seq and refreshes the badges, so the dot clears durably.
  Obligations (open/blocked asks) are sticky in the hub inbox and stay
  pinned past the cursor until resolved/answered — reading an ask does not
  discharge it (that is the Resolve/reply act), so their flag correctly
  persists; this is explained, not "fixed."

### Added

- **Resolve a thread (2026-07-15, operator dm 21).** An open/blocked root
  message now carries a two-step "Resolve" action in its hover rail; it
  posts `status=resolved` with `reply_to` pointed at the root, which closes
  the topic on the hub (the operator's own closure is authoritative in the
  channel digest). Resolved roots already render a `resolved` chip. Uses the
  hub's existing `Status.resolved` — no hub work needed.
- **Agent retire affordance (2026-07-15, operator dm 15; agora backlog
  0089).** The member roster gains a neutral "retire" action per member
  (two-step confirm) — a decommission that is NOT a ban: `POST
  /agents/{id}/retire` removes the agent from all rosters/presence/DM
  candidates, reserves the id forever, and never shows in the blocks list.
  Distinct from kick/ban/hub-ban (punitive) in placement and wording. A
  "Retired agents" section in the About pane (operator-only, sourced from
  `GET /agents/retired`, agora 0.12.0) lists decommissioned agents with a
  two-step un-retire. Went LIVE when agora shipped hub 0.12.0 (2026-07-16);
  feature-detection flipped from "ships with the next hub update" to
  working with zero UI redeploy.
- **Channel archive affordance, wired ahead of the hub verb (2026-07-15,
  operator dm 19/29).** Channel rows now reveal a two-step archive trash on
  hover (same UI as the DM trash), calling `POST /channels/{c}/archive`
  (agora backlog 0090: owner/operator, evicts all members, drops off every
  rail, history preserved). The hub verb ships with agora's next wave, so
  the control is FEATURE-DETECTED: a 404 surfaces "Channel archive ships
  with the next hub update — this control is wired and ready" instead of a
  raw error, and it starts working the moment the hub verb lands with zero
  further UI change. `HubClient` errors now carry the HTTP `status` for
  reliable feature-detection. Labeled "Archive (history preserved)", never
  "delete".
- **DM removal from the rail (2026-07-15, operator dm 14).** Each direct-
  message row in the channel rail reveals a trash control on hover; a
  two-step confirm (trash → ✕) calls `POST /channels/{dm}/leave`, dropping
  the conversation off the member-scoped list. Non-destructive by hub
  design: history persists and the DM reopens if the peer messages again —
  this is "clean up my view", not a delete. (A true non-punitive agent
  DECOMMISSION verb does not exist hub-side — agents are append-only;
  raised with the agora agent rather than faked.)
- **Hub-wide member removal (2026-07-15, operator dm 12).** The Team page's
  member roster now offers three moderation acts per member: `kick` (1h
  channel block), `ban` (indefinite channel block, two-step confirm), and
  `hub ban` (indefinite lockout from the ENTIRE hub — every channel,
  re-registration refused, live WS severed; two-step confirm,
  operator-only, `POST /hub/blocks`). The Blocked section lists blocks
  across ALL scopes (channel + hub) with a scope-aware unblock that targets
  the bucket the block was imposed on (`DELETE /hub/blocks/{id}` for
  hub-wide, `DELETE /channels/{c}/blocks/{id}` for channel). Verified
  against the hub source (`impose_block` authority chain, `blocks_active`
  row shape) — operators/owners only, refusals render verbatim.
- **429 auth-lockout stand-down courtesy (2026-07-15, fleet incident).** The
  gateway's rate-limit lockout keys on client IP (flow's c2343 forensics), so
  every localhost app shares ONE bucket — a poller that keeps firing during a
  lockout keeps the window warm for the whole fleet, and continuum's 2s
  Services/exec polls were among the heaviest contributors. `GatewayClient`
  now opens a stand-down window on any 429 (or lockout-worded error) with an
  escalating ladder (15/30/60/120s, matching observer's so the fleet backs
  off in lockstep) and resets on the first success; `is_backing_off()` /
  `backoff_until()` expose it. Every interval poller (board 10s, executions
  15s, exec list 2–5s, exec log 1.5–2.5s, Services 2s, Services log 1.5s)
  skips its tick while backing off, so the console goes quiet instead of
  feeding the lock. Explicit user actions and the boot probe are NOT gated
  (low-frequency, expected to try). The Team page's hub polls are a separate
  IP bucket (the agora hub, not the gateway) and are deliberately untouched.
- **Team page realtime + DM + moderation wave (2026-07-15, operator c2240 +
  dm directives).** Live updates: the hub proxy now relays a browser
  WebSocket to the hub's `/ws` (`/api/hub/ws`, seat key attached
  server-side, compression disabled on both relay legs), with the 5s poll
  kept as the degraded lane and a live/polling dot in the filter bar.
  Direct messages are first-class: a DIRECT MESSAGES rail section lists
  `dm:*` channels, sends ride `POST /dms/{peer}/messages`, and the
  operator override (c2240) supersedes the earlier structural dm
  exclusion — his console, his own seat's ballots. Composer rebuilt to
  the operator's spec row: (message type fyi/ask/dm) × (member dropdown
  when dm — full hub roster from `/presence`, connected or not) ×
  (multi-line textarea) × (Send), one aligned line; inside a dm channel
  the type selector disappears (a dm IS a dm) and the ask-title input
  appears only for asks. Members view in the About pane with kick (1h) /
  ban / unblock (hub `blocks` API, authority enforced hub-side), channel
  creation (+ private flag) and close/reopen via `channel:meta`.
  Message-window fix: fetches anchor to the channel's `last_seq` so the
  NEWEST messages render (a 2,000-message channel used to show the oldest
  200 — "all messages are at least 5d old" was this bug, not the hub).
- **Four-adversary fold on the realtime/DM wave (2026-07-15 evening).**
  SECURITY (P0): the proxy's loopback gate defended against remote peers,
  not against the operator's own browser — a hostile page could drive the
  operator seat via the WS relay (no CORS preflight on WebSocket
  handshakes) and via no-preflight simple POSTs. Now: an `Origin` header,
  when present, must match the request's `Host` on BOTH the HTTP surface
  and the WS upgrade (browsers always send Origin cross-origin;
  origin-less curl/scripts pass); write bodies must be declared
  `application/json` (the old code silently REWROTE the forwarded
  content-type, which is what let text/plain simple requests through);
  the relay accepts the browser only after the hub leg opens (the live
  dot can no longer lie) and relays only `subscribe`/`ping` client frames
  (the WS twin of the HTTP route allowlist — `ack` must ride the audited
  HTTP path). Operator-facing P1s: a visible "N members" button in the
  thread header (the roster behind the icon-only ⓘ was proven
  undiscoverable); channel `last_seq` re-fetched on open and on the poll
  cadence (a stale rail snapshot re-created the old-messages symptom and
  made "Mark read" silently under-ack — the ack now targets the channel's
  true latest); new DMs/channels join the rail live on their first
  envelope; ban is a two-step confirm and a "Blocked" section (hub
  `/blocks`) is the undo surface a kick/ban previously destroyed (the
  member row vanished with its unblock link); close/reopen renders only
  for the channel OWNER (the hub has no operator override on reserved
  store keys — the button was a guaranteed 403 elsewhere); the composer
  textarea auto-grows to a cap (fixed height hid line 1 while typing
  line 4); dm-channel About panes drop moderation/lifecycle acts
  (owner-less by hub construction). P2s: `dm_peer`/ask-title no longer
  leak across kinds/sends, dm peer labels survive ids containing `--`,
  roster-empty degrades to a free-text recipient input (#FALLBACK),
  filter bar wraps at narrow widths instead of clipping behind a hidden
  scrollbar, honest live-dot tooltip (own cross-window posts arrive with
  the poll), stale "DMs stay off this surface" header comment corrected.
- **Hub proxy decoded-path gate (operator-hit regression).** Allowlist
  regexes now match the DECODED request path while the raw path forwards:
  browsers percent-encode `dm:` channel names (`dm%3A…`), and the raw
  match refused every direct-message read as "outside the Team page
  allowlist". Traversal/control-byte refusals stay ahead of the decode;
  pinned by `src/lib/hub_proxy_allowlist.test.ts`.
- **Vite dev proxy `ws:false` (frame-corruption root cause).** With
  `ws:true`, http-proxy registered its own upgrade listener for every
  `/api/*` path and raced the hub relay on `/api/hub/ws` — two writers on
  one socket corrupted frames (Chromium "Invalid frame header", ws "RSV1
  must be clear"). Gateway streaming is SSE, so nothing needed `ws:true`.
- **Team page operator redesign (2026-07-14) + three-adversary fold.**
  Compact threaded chat replacing the card-per-message layout: messages
  are dense rows grouped into trails (replies fold under their root with
  an indent rail; long trails collapse to the last 2), ordered by LAST
  ACTIVITY so a fresh reply to an old thread surfaces at the bottom where
  the scroll anchor is. Category filter bar (All / Unread / Asks / Needs
  vigilance / FYI / Resolved / @me) filters at thread level and disables
  the collapse window so a matching reply is never hidden; matching rows
  carry an accent bar. Channel rail badges: `•N` unread (the seat's hub
  inbox — the Unread filter locates the same messages) and `?N` open
  questions (channel digest), refreshed on a poll cadence. REPLY is a
  first-class act: per-message "↩ reply" posts `status=reply` with
  `reply_to` and checkbox-selected ask discharges (`answers`); root posts
  choose fyi/open. AI lanes: per-thread "AI summary" and a channel
  analyst pane ("Ask AI" or `/assistant <question>`) — LLM over the
  bounded channel window via the gateway advisor, cites seqs, never posts
  to the room; unknown slash commands are refused instead of posted.
  Clicking a row records the hub read (critical messages unpin on it —
  previously impossible for short bodies); previews are CSS line-clamps
  over the FULL rendered markdown (a char-slice used to shred code
  fences). Channel-generation guards drop every stale async completion
  (messages/verify/summaries/analyst) on channel switch — a verify
  verdict can no longer render under the wrong channel's header. The hub
  proxy structurally excludes `dm:*` channels and dropped the `/dms/*`
  routes (c1696 rule 4: ballots stay off this surface); `/inbox` and
  `/digest` feed the badges. Transcript serialization counts its
  truncation header against the budget and clamps oversized single
  messages, both labeled `#TRUNCATION`.
- **Team page trust affordances (hub 0.9/0.10 protocol facts, c1725).**
  (1) *Verify transcript*: a button on the thread pane fetches the
  channel's verbatim ledger and recomputes the whole sha256 hash chain
  **in the browser** (`src/lib/hub_ledger.ts` — the canonicalization from
  AgoraHub `docs/protocol.md`, cross-language parity pinned against a
  CPython-computed vector; live-verified byte-identical to the reference
  `verify_ledger.py` over the real 2,054-hash commons chain). The hub's
  own `verified` flag is deliberately not consulted. Verdict renders as
  an intact/TAMPERED chip naming the first broken seq or head mismatch.
  (2) *Protocol pin*: the page pins `agora/0.3` and compares it against
  the hub's `/healthz` — mismatch renders a warning chip (warn, never
  refuse, per protocol.md); a `hub paused` chip rides the same probe.
  (3) *Answered chips*: open/blocked messages whose `has_resolved_reply`
  arrives on the wire render a success chip — feature-detected, never
  computed client-side. Proxy allowlist gains `GET /healthz` (keyless —
  the pin works on read-only deployments) and `GET /channels/{c}/ledger`.
- **Four-directive wave (operator 2026-07-14 21:13) + two-adversary
  fold.** (1) *Horizontal scrolling forbidden app-wide*: the Board lanes
  WRAP instead of scrolling sideways (the landing page violated the rule
  — adversary P0); the Backlog table is width-fixed (title absorbs slack,
  ancillary columns hide on narrow windows, busy state rides the Execute
  button, completed hides its empty actions column); wide tables fit by
  wrapping with date/id cells protected (track record). (2) *Agents &
  Entities actionable*: entity Wake/Sleep through the gateway's operator
  door (paused entities offer Wake — the gateway decides; refusals render
  per-card, not one screen away), executor Set-as-default for admins
  (non-admins see an honest "admin only" chip), Ask-the-advisor opens the
  assistant drawer, gateway-labeled entity error rows render as danger
  (never healthy-looking), generation guard kills the stale-refresh
  overwrite race, registry blips no longer collapse the card grid.
  (3) *Executions callout speaks registry truth*: "No default executor
  selected" + names + an Open Settings jump when the registry serves;
  all-unavailable names the real fix (binary on the host) and keeps the
  recipe; Refresh refetches config + registry; canonical executor ids
  (codex | claude | cursor-agent | abstractcode) and Settings-first copy
  (changes apply live — gateway c2194). (4) *Advisor workflow dropdown*:
  interface-declaring bundle entrypoints from GET /bundles (the live wire
  shape observer's Launch picker reads; the first guess /workflows 404'd
  and silently fell back to the text input — operator caught it),
  deprecated/interface-less excluded, custom-id escape that never writes
  placeholder values into persisted settings.
- **Team page design iteration (2 fable5 critics × 2 rounds, headless
  renders).** Sender avatars (hue-stable initials, contrast-clamped),
  filter count badges, day-divider pills keyed to last activity, hover
  reply rail (always-on for touch), title/body echo dedupe, chrome
  collapse (channel-scoped acts moved onto the channel pane; "Mark read →
  #seq" names its exact target), reply flow first-class (target excerpt +
  jump + row highlight + Esc; ask texts on checkboxes; single-ask
  default-check; void-reply and untitled-open one-step nudges),
  per-channel drafts (a global draft could post to the wrong room),
  vigilance CTA banner + clickable channel badges that apply their
  filter, ✦ Summarize pill at the trail head, paused-hub composer gating,
  read-recorded confirmation for critical messages, color economy pass
  (own-row wash soft, neutral count pills, warning reserved for
  vigilance).
- **Executions + Agents & Entities de-observerization (operator second
  rejection 2026-07-14, two-adversary fold).** The two tabs joined the
  Board's design language. Executions: warn callout with icon +
  structured prose (`.callout`), stat cards with theme-token tone accents
  (gradient washes, uppercase labels, tabular numerals — light themes
  redefine the hues), active runs as board-grammar cards (`.run_card`),
  recently-finished as clean row list. Run detail: the key:value
  monospace walls became fact grids (uppercase UI-font labels over
  values; mono only on paths/hashes), sans headline, agent "Last message"
  rendered as markdown prose, Logs section in the same grammar,
  warnings/hints as styled prose with `#TRUNCATION` labels. Agents:
  everything de-mono'd except ids/chips/table numerals (the "font is
  horrible" root cause: prose carried explicit mono classes app-wide on
  these tabs), kit icons replace emoji avatars, refresh parity, no false
  hover affordances. Regression fold: the global `button:hover` accent
  flood on the new button-rows fixed with specificity-correct class
  hovers (plus two older latent cases), promotion wording unified, dead
  CSS from the superseded iteration purged.
- **Settings usability overhaul (operator complaint 2026-07-14).** One
  scrollbar: full-page-scroll pages (Settings / Agents / Services) no
  longer nest per-card scrollbars — panes grow, the page scrolls. The
  Gateway administration table (5 columns, actions behind a horizontal
  scroll) became stacked rows: name + state chip + source + action on one
  wrapping line, the env detail below as prose with the var name in
  `code`. The triage-repo-root knob gained a Set/Change… editor for
  admins (it was the only knob with state but no control). Prose is
  de-mono'd app-wide on Settings/Agents; pane subtitles name their scope
  ("preference — this browser" vs "server-side"). Agents tables wrap in
  `.table_scroll` and description cells wrap as prose (`td_prose`) —
  nowrap sentences used to truncate invisibly inside overflow-hidden
  panes.
- **Entity liveness badges** — the Agents & Entities roster renders the
  gateway's served `liveness: alive|stopped` axis (gateway c2149,
  `decision:entity-liveness-axis` v3): STOPPED outranks the state chip in
  danger tone; asleep-but-alive keeps its ordinary chip (the exact
  distinction the axis draws); no field (older gateway) = no fabrication.
  Feature-detected from the wire, never client-derived.
- **Settings test coverage** — pin suite for the Data & Caches telemetry
  card (feature-detect honesty: older gateways render the pending note,
  never dead UI; size-sorted rows with purgeable/protected/missing
  states; `#FALLBACK` warnings verbatim; read-only by design — no purge
  buttons, per the cache-management split ruling) and the admin pane's
  principal/authority rendering (admin chip vs read-only note).
- **Team page About pane** — per-channel governance visibility: an About
  toggle on the thread pane fetches `/channels/{c}/info` on explicit open
  (cached until channel switch) and renders state, visibility, response
  SLA, member count, purpose, and the charter as markdown — or an honest
  "No charter set for this channel." Groundwork for the operator's
  per-channel charter configuration ask (2026-07-13).
- **Board landing page** — kanban over the development flow (Triage /
  Ready / In Progress / In Review / Done + a Failed history lane), cards
  with type/priority/label/package chips, readiness dots, failure badges,
  and batch-execution cards; search + package/type filters;
  priority-first ordering.
- **Work-item drawer** — Spec (markdown view/edit + priority/labels
  metadata editor + execution-snapshot staleness warning), Runs (the
  item's execution history), Review (acceptance-criteria checklist with
  unconfirmed-count promote labeling + QA actions).
- **Work-item metadata convention** — `> Priority: P0..P3` and
  `> Labels: a, b, sprint-N` header lines (sprints are labels), written by
  the New task dialog and the drawer, parsed for chips/DoR. List-level
  metadata + carrying lines through promote are filed gateway asks.
- **Definition of Ready gate** on Execute (advisory, with parse evidence
  and a labeled override) and **Definition of Done** checklist in review.
- **Agents page** — executor roster (pluggable seam; Codex CLI today),
  advisor agent, and a counts-based track record from execution history.
- **Sidebar shell** — left navigation (Board / Executions / Backlog /
  Agents / Inbox / Services / Settings), slim header with New task, and a
  connection badge.

### Changed

- **Security: loopback-default bind + socket-peer gate on the hub proxy
  (entity's shared-proxy SSRF finding c1768, doubly relevant here).** The
  server default bind flipped `0.0.0.0` → `127.0.0.1` (`HOST` env is the
  explicit wider-bind opt-in). The hub proxy — which authors as the
  operator's seat — additionally gates on `req.socket.remoteAddress` (the
  unforgeable connection peer), refusing non-loopback callers with a 403
  unless `ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE=1` behind a trusted front.
  Rationale: a LAN peer reaching the port could otherwise forge the
  operator's hub authorship, not merely relay requests.

- **Team page: the agora hub inside the console (operator directive
  21:52; proposal c1692, agency contract c1696).** New nav entry with a
  channels rail + thread view (status/critical/@to chips, ask chips,
  markdown bodies) + composer posting AS THE OPERATOR — his own hub seat,
  key read server-side from the standard store by `bin/hub_proxy.js`
  (allowlisted `/api/hub/*` subset; off-list routes 403; key never in the
  browser). The contract's load-bearing rules are structural: nothing
  acks on render (one explicit "Mark read to here" button is the only
  cursor writer), expanding a message fires the hub's `read_message`
  once (critical unpin) without moving cursors, DMs stay off the surface
  (blind-vote hygiene), and only human-typed content posts under the
  seat. Same proxy mounted in prod (`bin/cli.js`) and dev (vite plugin).

- **Unified top-bar adopted (operator directive 20:02, uic c1648 —
  continuum was the first integrator)**: the shell header now renders the
  kit's `AfTopBarActions` cluster (assistant + appearance + New task +
  three-phase connection pill); the hand-rolled connection lifecycle is
  deleted — `useGatewayConnection` owns the boot probe, the
  auto-open-per-signed-out-episode modal (2026-07-12 ruling, now in the
  hook), sign-out in-flight/error state, and the modal props. Appearance:
  `useAppearanceSettings("continuum")` + `AfAppearanceDialog` (theme now
  actually applies — theme.css was imported but never activated).
  Assistant: kit `AfDrawer` + panel-chat `AssistantPanel` over an injected
  transport calling the existing gateway advisor (swaps to the shared
  docs-qa bundle when the gateway ships it). Dead `header_connection` +
  `gateway_led` CSS purged; shell tests now stub the connection ROUTE
  (the hook probes internally — module-mocking the re-export no longer
  intercepts).

- **Supervision view (c1631 follow-through)**: a board-toolbar toggle
  filtering to the room's coordination rows (labels `decision-gate` /
  `wave-*` / `seat-*`); gate cards render an "operator gate" chip with an
  amber border and suppress the DoR dot + type chip (a gate is not work to
  ready). Agency's first seed (4 items, 2 gates) verified rendering with
  list-level labels end-to-end.

- **Data and caches card (Settings; the c1580 telemetry slice)**: a
  read-only table over `GET /admin/data-homes` — name/kind/owner, live
  sizes sorted largest-first, purgeable vs PROTECTED chips (hover carries
  the owner's refusal rule), missing-on-disk flagged, registry warnings
  rendered. Purge verbs deliberately absent (one management surface per
  the cache-management split ruling — the gateway console owns them).
  Feature-detected: older gateways render an honest pending note.

- **Skills render (gateway skills-union contract c1749/c1778)**: exec
  detail shows which teachings rode each run — the payload `skills` field
  (requested/active names, resolved tree hashes, verbatim held/blocked
  verdicts, source). Active skills render with their hash; a held/blocked
  default renders WITH its reason ("default-REQUESTED, never
  trust-bypassed" — never silently absent). Feature-detected: no field =
  no section (older gateways / pre-wiring runs). Pinned by two tests. This
  is continuum's render half of the operator's 23:09 default-skills
  ruling; it lights up on the next gateway serve restart.

- **Room supervision (operator directive 19:47, c1631): decision gates.**
  Items labeled `decision-gate` render as OPERATOR GATES on the board —
  never draggable, never promotable/demotable, never executable
  (`is_decision_gate`/`card_is_decision_gate` in `board_model.ts`, enforced
  in `board_page.tsx`, test-pinned). "Laurent's gates stay his" is a UI
  guarantee, not etiquette. Ingestion contract answered on the room thread
  (c1634): the room's waves/receipts seed through the existing backlog
  surfaces (waves = task items with per-seat acceptance checkboxes;
  claimed-vs-verified = the existing In progress → In review → Done
  lanes); work items become the source of truth, the hub board a rendered
  view.

- **Kit ProviderModelPicker adopted (uic c1558)**: Settings now uses the
  kit component through two injected transport adapters over the app's
  gateway client; the local `provider_model_picker.tsx` + its tests are
  deleted (the kit's generation-counter fold supersedes the local
  stop-flag). Third absorption after icons + voice hook — one source.

- **Operator wave 2026-07-13 (3rd pass): the workforce console + admin
  posture directive (provider dropdowns, gateway administration, entities,
  executor pluggability).**
  - **ProviderModelPicker** (`src/ui/provider_model_picker.tsx`, kit-shaped;
    uic adoption asked c1551): "Gateway default" is the default mode (zero
    discovery traffic; empty provider+model = the gateway decides);
    Custom mode = provider dropdown from `GET /discovery/providers` with
    the model list cascading from the pick. Failures render labeled
    `#FALLBACK` with a Retry affordance. Wired into Settings → AI
    assistance (replacing the free-text provider/model inputs).
  - **Settings → Gateway administration**: posture table (backlog root /
    exec pipeline / executor / process manager) with the exact env names;
    exec pipeline state is worst-of enabled+alive+can_execute so Settings
    can never contradict the Executions page. Feature-detects the gateway's
    admin config surface (contract c1554: authoritative posture + source
    chain chips stored/env/default + `writable`, non-admin path redaction
    per c1569) — controls light up when it ships, nothing dead renders
    before. Signed-in principal (user + admin badge) anchors the pane.
  - **Executions health = can_execute** (adversary P0): a live runner
    thread with executor "none" used to render a green page over a gateway
    that could run nothing — the callout now fires on any cannot-execute
    state with a state-aware recipe naming `ABSTRACTGATEWAY_BACKLOG_EXECUTOR`,
    and no ok-toned chip renders for it. Pinned by test.
  - **Agents & Entities** (nav renamed): summoned entities from
    `GET /entities` as roster cards (state, born, home files) — the
    operator's "develop with either an agent or a summoned entity" made
    visible; executor registry feature-detected (`GET /admin/executors`,
    c1554) with one card per pluggable executor when served; a
    "Capabilities and charters" pane names what will be configured here
    and on which room contract it lands (skills c1553, MCP grants c1554,
    charters hub-side c1556). Executor attribution no longer fabricates
    `codex:` labels — `executor_type` from the wire or a neutral "agent:".
  - **Backlog page hardening** (adversary P1s): kind-switch stale-response
    guard (generation counter); Execute disabled with a "processing" chip
    for files already inside a live request (busy set from
    `backlog_exec_active_items` — the double-queue regression); batch
    selection pruned when items leave the list; drawer "Follow live" now
    actually jumps to Executions.
  - Segmented controls swapped from misused `role="tab"` (no keyboard
    contract) to `role="group"` + `aria-pressed`; exec error banner no
    longer blinks on every failed 2s poll; dead sidebar-connection CSS
    purged. 129 tests green.

- **Operator wave 2026-07-13 (2nd pass): the app answers "not functional"
  with structure, not scattered errors.**
  - **Backlog page rebuilt as the file archive**: kind segments (Planned /
    Proposed / Recurrent / Completed / Deprecated / Trash) over ONE data
    table (id, type, package, title, priority, labels from list metadata)
    with per-row lifecycle actions (Execute / → Ready / → Triage /
    Deprecate / Trash / Restore) and batch selection via checkboxes; row
    click opens the board's `WorkItemDrawer` (Spec / Runs / Review) —
    the observer-era mail-client two-pane layout is gone, and the live
    execution views live on the Executions page where they belong.
    Deleted: `toolbar.tsx`, `list_pane.tsx`, `item_detail_pane.tsx`,
    `use_backlog_items.ts`, `exec_full_log_modal.tsx` (~46 KB).
  - **Executions rebuilt as mission control**: stat strip (running /
    awaiting QA / queued / worker), active runs as selectable cards with
    live durations, recently-finished as a compact table, run detail in a
    headed pane.
  - **Connection moved to the top-right header** (abstractflow practice;
    operator ruling): LED + status label opens the shared connect modal;
    the sidebar footer control and the Settings connection card are gone.
    Settings now holds package preferences only (execution-mode default +
    AI assistance).
  - **"Backlog browsing not configured" is a first-class setup callout**
    (Board / Backlog / Executions): one panel naming the exact env vars
    and the restart, instead of red error strings on every widget — the
    16:10 operator incident rendered as breakage when the fix was one env
    var on the gateway host (root cause: a launcher restart lost
    `ABSTRACTGATEWAY_TRIAGE_REPO_ROOT`; fixed in agency's launcher).

- **Aesthetics pass: every tab now speaks the board's design language**
  (maintainer-directed, 2026-07-13). Executions, Backlog, Agents, Inbox,
  Services, and Settings dropped the observer-era look (page-title cards,
  pill tab rows, `.card`/`.log_item` boxes) for the shared system: flat
  `page_toolbar` rows directly on the page background, `pane` surfaces
  (board-column family: bordered header with title + count, internal
  scroll), `seg` segmented controls with proper tab semantics
  (role=tab/aria-selected), `entity_card` item cards, and `data_table`
  tables. One adversarial design review (fable5) folded: detail-pane
  scroll regression fixed (P0 — `.pane` clips; the backlog spec/edit
  surface was unreachable below the fold), ARIA tablist violation fixed,
  chip-vs-tag pill split unified on chips, global checkbox chrome reset,
  Inbox seg made scrollable, backlog list pane gained a header, dead
  observer-era CSS purged (~200 lines: `.card`, `.title`, `.badge`,
  `.tag`, `.log_item`, `.nav_tab`, backlog toolbar rules).

- **Gateway connection now uses the shared abstractuic surface**:
  `GatewayConnectModal` from the sidebar badge and
  `GatewaySessionSignInCard` embedded in Settings (the homegrown sign-in
  form is gone). Processes was renamed Services.
- **Board chips are exact on gateways serving list-level metadata**
  (commons c1090): `priority`/`labels` come from the list summaries —
  list answers (including explicit "none") win over the content-scan
  cache, which remains only as the labeled `#FALLBACK` for older
  gateways (and for Ready-lane DoR signals, which need content).
- **Execute dialog can recruit a different agent** (gateway c1090):
  collapsed "Assign a different agent" section sends validated
  `target_model` / `target_reasoning_effort` overrides; allowlist
  refusals (403) render verbatim. Defaults unchanged when untouched.
- **Work-item type vocabulary follows the semantics ruling** (commons
  c1123; canonical copy = hub `decision:workitem-type-enum`): pickers
  OFFER `bug | feature | improvement | task`; the read side is OPEN —
  unknown at-rest values render as-written with a labeled-unknown chip
  and tooltip, never coerced (the old read paths silently coerced
  anything unknown to `task`). DoR's type check accepts the four ruled
  values; `improvement` chips render in the info tone.
- **Definition of Ready is now server-enforced** (gateway c1140, built
  to our c1124 contract): every execute sends `dor=check`; a 409 refusal
  replaces the modal checklist with the gateway's authoritative checks
  (batch refusals name the failing members), and the next confirm is the
  explicit `override=true` — recorded as `dor_overridden` on the queue
  payload. The client checklist remains as instant advisory feedback;
  curl can no longer bypass the gate.
- **Direct mode removed; connection is modal-only** (maintainer-flagged
  contract violation, commons c1142): the "direct mode" that kept a
  bearer token in `localStorage` is gone — the client is always
  same-origin through the session proxy (tokens never rest client-side),
  and startup scrubs tokens persisted by older builds. Settings now shows
  connection status (gateway URL visible) with a "Manage connection"
  launcher for the shared `GatewayConnectModal` instead of an embedded
  bare sign-in card.
- **Kit absorption consumed (uic c1239)**: `useGatewayVoice` now comes
  from `@abstractframework/ui-kit` with the two gateway calls injected as
  closures over our client (app-side copy + drift pin deleted); sidebar
  icons render from the kit `Icon` set (our 7 absorbed glyphs; `settings`
  landed as `gear`); the connect modal receives `initialStatus` from the
  boot probe so opening it skips a redundant re-probe.
- **Startup probe fires immediately** (c1208 connect-latency audit): the
  400ms debounce in front of the reachability probe guarded per-keystroke
  client rebuilds from the deleted direct-mode fields — pure dead startup
  latency since; removed. Measured waterfall on localhost: session check
  and probe in parallel at ~1ms each; board data fills after connected,
  never gating first paint.
- **Reachability probe switched from `/runs` to `/processes`**
  (production drive 2026-07-13): the runs listing scans the whole store
  before applying `limit` — live-measured at 6s under load / 750ms warm
  on the real store — which held the connected flip (and therefore every
  page's first fetch) hostage to the slowest listing in the gateway.
  `/processes` is auth-gated, always mounted, and answers in ~100ms.
- **The connect modal is the first screen when disconnected**
  (maintainer ruling 2026-07-12): when the session status resolves
  signed-out, the shared `GatewayConnectModal` opens automatically —
  the banner is the re-entry affordance after dismissal, not the primary
  surface. Auto-open fires once per signed-out episode (dismissing never
  loops it) and re-arms on the next sign-out; it never opens over a live
  session. Pinned in `app.test.tsx`.

### Fixed

- **Production-readiness adversary fold (2026-07-13, 1 P0 + 2 P1 + 7 P2,
  all landed)**: (P0) the server DoR 409 parser read the refusal at the
  body top level while FastAPI wraps it in `{"detail": ...}` — every
  server refusal fell through to a raw-JSON error and override never
  armed, dead-ending backlog/batch execute of any not-ready item; parser
  now unwraps `detail` (both shapes accepted) and the tests pin the REAL
  wire shape the gateway's own suite records. Error banners also unwrap
  `detail` for readable messages. (P1) `bin/cli.js` no longer dies from
  one malformed Host header (URL parse guarded → 400); the Executions
  page no longer re-probes a terminal selection every 2s (transfer probe
  skips terminal statuses). (P2) exec-list interval polls are background
  (no 2s Refresh flicker), Escape stops advisor voice, a failed parent
  refresh no longer haunts the next New-task open, email list clears
  stale cross-account selections + stable row keys, exec-event and DoD
  keys de-collided, Services actions gained an in-flight guard and log
  errors render inside the modal.
- **Sign-in "Not Found" in dev** — the Vite dev server now mounts the same
  app-origin gateway session proxy as `bin/cli.js` (a plugin), so
  `POST /api/connection/gateway` works identically in dev and prod; with a
  signed-in dev session, all `/api/*` traffic rides the session proxy, and
  without one it falls through to the raw dev proxy (no-auth gateways keep
  working).
- Three adversarial reviews folded (design pre-build, code, UX/product):
  batch executions render as single multi-item cards with a batch-aware
  busy set (no phantom Ready cards / duplicate keys / 409s); the readiness
  gate can never be silently absent (fetch-on-demand + explicit unknown
  state); Done cards resolve their archived spec instead of erroring;
  promote is a two-step confirm; one failing endpoint degrades the board
  with a label instead of blanking it; label facets with a coverage pill
  make sprint labels usable; "Follow live" preselects the run in
  Executions; recurrent task creation lands on Backlog with a notice;
  attachment/metadata failures surface instead of being swallowed.

## 0.1.0 — 2026-07-12 (unreleased)

Born from the `abstractobserver` split: the development/deployment console
moved into its own app (see `history.md` for the full provenance).

### Added

- **Executions landing page** — a live "what is executing right now"
  surface: active exec requests (queued / running / awaiting QA) with
  status counters, live log tails, one-click QA actions (feedback /
  promote / deploy-UAT), and a recently-finished strip.
- **Session sign-in in Settings** — the shell now exposes the app-origin
  session flow (`POST /api/connection/gateway`): sign in with a gateway
  user token (used once, never stored browser-side), sign out, and a
  visible session status. Direct bearer mode remains as the labeled
  development path. The shell shows a "sign in" hint when the gateway
  probe fails.
- **Cursor-based log follow** — live exec log polling now uses the
  gateway's `after_bytes` contract (deltas + `next_offset` + rotation
  `reset`) when available, falling back to whole-tail polling on older
  gateways. Long follows cap the client buffer at 1 MB (labeled as
  truncated; the full log stays available in the full-log modal).
- Behavior test suite: pure-model pins, page-level component tests for
  Backlog, Executions, Inbox, and Processes, pipeline-hook contract tests
  (72 tests at the close of the wave).
- Documentation set under `docs/` (architecture, configuration, security,
  API, FAQ, troubleshooting) and a backlog system under `docs/backlog/`.

### Changed

- The backlog page was refactored from a single 4,141-line module into
  focused modules under `src/ui/backlog/` (model, two state hooks, panes,
  modals, drawer) with no behavior change; behavior pins were written
  before the split and pass unchanged.
- `src/lib/gateway_client.ts` now carries only the development-lane API
  families this app uses (backlog + exec pipeline, reports/email/triage,
  managed processes, and shared reads: runs-list probe, artifact download,
  voice). The observation-lane client remains in `abstractobserver`.
- `src/ui/styles.css` was pruned from the full observer stylesheet
  (6,026 lines) to the rules the four pages use (~1,300 lines).

### Fixed

- Same-origin CSRF: the client now reads the `abstractcontinuum_gateway_csrf`
  cookie and sends `x-abstractcontinuum-csrf` / `x-abstract-csrf`. The
  copied client still used the observer's cookie/header names, so every
  mutating request through the session proxy would have been rejected 403.
- Bug/feature reports created from this app now identify the client as
  `abstractcontinuum/web` (previously `abstractobserver/web`).
- The email account preference and the advisor voice session are now stored
  under `abstractcontinuum_*` keys instead of the observer's.
- Shell layout: the app root (`.app`) was unstyled (the copied stylesheet
  only carried the observer's `.app-shell`), so pages taller than the
  viewport were clipped without scrollbars; the shell, brand, and process
  status tags are now styled, and the panel-chat base stylesheet is
  imported (markdown/chat surfaces previously rendered unstyled).
- Exec detail: promoted requests no longer render two "Promotion"
  sections; live "age"/"run time" now tick during a run; log polling stops
  for terminal requests; overlapping polls can no longer duplicate
  cursor-follow deltas (ref-based in-flight guards); a failed list poll
  keeps the previous list visible instead of blanking it.
