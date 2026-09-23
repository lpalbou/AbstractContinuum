// @vitest-environment node
//
// Pins for the Team page pure model: thread grouping (reply chains fold
// into their in-window root; orphans labeled, never mis-merged; ordering
// by LAST ACTIVITY so fresh replies surface at the bottom), category
// filters (thread-level: a matching reply keeps its context; Unread rides
// the same inbox data as the badges), badge grouping, and the labeled
// #TRUNCATION transcript budget with the per-message clamp.
import { describe, expect, it } from "vitest";

import type { HubMessage } from "./hub_client";
import {
  compose_status,
  debt_seqs_by_channel,
  escalated_seqs_by_channel,
  resolve_fs_mention,
  SEARCH_SECTIONS,
  snippet_spans,
  dm_peer_of,
  replied_ids,
  reflow_prose_walls,
  autolink_body,
  extract_fs_paths,
  filter_threads,
  fs_children,
  group_slug,
  neutralize_unsafe_embeds,
  group_threads,
  msg_matches_filter,
  parse_group,
  parse_member_list,
  sender_hue,
  serialize_transcript,
  unread_by_channel,
  unread_seqs_by_channel,
} from "./team_model";

function msg(seq: number, over: Partial<HubMessage> = {}): HubMessage {
  return {
    id: `m${seq}`,
    channel: "commons",
    seq,
    sender: over.sender || "core",
    kind: "message",
    status: over.status || "fyi",
    body: over.body ?? `body ${seq}`,
    ...over,
  } as HubMessage;
}

describe("group_threads", () => {
  it("folds reply chains into their root", () => {
    const ms = [
      msg(1, { status: "open" }),
      msg(2), // unrelated root
      msg(3, { reply_to: "m1", status: "reply" }),
      msg(4, { reply_to: "m3", status: "reply" }), // grandchild → same root
    ];
    const threads = group_threads(ms);
    const t1 = threads.find((t) => t.root.id === "m1")!;
    expect(t1.replies.map((r) => r.id)).toEqual(["m3", "m4"]);
    expect(t1.last_seq).toBe(4);
    expect(threads.find((t) => t.root.id === "m2")!.replies).toEqual([]);
  });

  it("orders threads by LAST ACTIVITY: a fresh reply moves an old root to the bottom", () => {
    const ms = [
      msg(1, { status: "open" }), // old root...
      msg(2), // newer standalone
      msg(5, { reply_to: "m1", status: "reply" }), // ...gets the newest reply
    ];
    const threads = group_threads(ms);
    // m2's trail (last_seq 2) renders BEFORE m1's trail (last_seq 5):
    // the active thread sits at the bottom, where the scroll anchor is.
    expect(threads.map((t) => t.root.id)).toEqual(["m2", "m1"]);
  });

  it("labels replies whose parent left the window as orphan roots (never mis-merged)", () => {
    const ms = [msg(10, { reply_to: "m-outside" }), msg(11)];
    const threads = group_threads(ms);
    const orphan = threads.find((t) => t.root.id === "m10")!;
    expect(orphan.orphan).toBe(true);
    expect(threads.find((t) => t.root.id === "m11")!.orphan).toBe(false);
  });

  it("labels a mid-chain gap: reply → missing middle → present grandparent stays split, labeled", () => {
    // m3 replies to m2 (absent); m1 present but unreachable through the
    // gap — m3 must become its own labeled orphan root, never merged
    // into m1 by guesswork.
    const ms = [msg(1), msg(3, { reply_to: "m2" })];
    const threads = group_threads(ms);
    expect(threads.map((t) => t.root.id).sort()).toEqual(["m1", "m3"]);
    expect(threads.find((t) => t.root.id === "m3")!.orphan).toBe(true);
  });

  it("survives a reply cycle in wire data without hanging", () => {
    const a = msg(1, { reply_to: "m2" });
    const b = msg(2, { reply_to: "m1" });
    const threads = group_threads([a, b]);
    expect(threads.length).toBeGreaterThan(0);
  });
});

describe("filter_threads", () => {
  const ctx = { seat: "laurent" };
  const threads = group_threads([
    msg(1, { status: "open" }), // unanswered ask
    msg(2, { status: "fyi" }),
    msg(3, { status: "resolved" }),
    msg(4, { status: "fyi", to: ["laurent"] }),
    msg(5, { status: "open", has_resolved_reply: true }), // answered ask
    msg(6, { status: "fyi", critical: true }),
  ]);
  const roots = (ts: ReturnType<typeof group_threads>) => ts.map((t) => t.root.seq).sort((a, b) => a - b);

  it("asks = open/blocked threads", () => {
    expect(roots(filter_threads(threads, "asks", ctx))).toEqual([1, 5]);
  });

  it("vigilance = unanswered asks + critical + @me (answered asks drop out)", () => {
    expect(roots(filter_threads(threads, "vigilance", ctx))).toEqual([1, 4, 6]);
  });

  it("vigilance folds hub-escalated seqs from the inbox merge (backlog 0010)", () => {
    // Seq 2 is a plain fyi — invisible to vigilance on message axes alone;
    // the hub escalated it (stale obligation → escalated/interrupt on the
    // inbox envelope), so the seq-keyed merge must surface it.
    const esc_ctx = { seat: "laurent", escalated_seqs: new Set([2]) };
    expect(roots(filter_threads(threads, "vigilance", esc_ctx))).toEqual([1, 2, 4, 6]);
  });

  it("to_me / resolved / fyi select by their axes; all passes through", () => {
    expect(roots(filter_threads(threads, "to_me", ctx))).toEqual([4]);
    expect(roots(filter_threads(threads, "resolved", ctx))).toEqual([3]);
    expect(roots(filter_threads(threads, "fyi", ctx))).toEqual([2, 4, 6]);
    expect(filter_threads(threads, "all", ctx)).toHaveLength(6);
  });

  it("unread filter rides the same inbox seqs as the badge", () => {
    const unread_ctx = { seat: "laurent", unread_seqs: new Set([2, 6]) };
    expect(roots(filter_threads(threads, "unread", unread_ctx))).toEqual([2, 6]);
    // Without inbox data the filter is empty, never a guess.
    expect(filter_threads(threads, "unread", ctx)).toEqual([]);
  });

  it("unread filter keeps a just-read message visible via the entry snapshot (operator dm 63: reading must not evict mid-read)", () => {
    // Entered the filter with 2+6 unread; the operator read #2 (ack fired,
    // live set shrank to {6}) — the snapshot keeps #2's thread on screen.
    const mid_read = { seat: "laurent", unread_seqs: new Set([6]), unread_snapshot_seqs: new Set([2, 6]) };
    expect(roots(filter_threads(threads, "unread", mid_read))).toEqual([2, 6]);
    // A NEW arrival (live-only, not in the snapshot) still shows.
    const with_new = { seat: "laurent", unread_seqs: new Set([4, 6]), unread_snapshot_seqs: new Set([6]) };
    expect(roots(filter_threads(threads, "unread", with_new))).toEqual([4, 6]);
  });

  it("keeps a thread when a REPLY matches (the trail is the reading unit)", () => {
    const t = group_threads([msg(1, { status: "fyi" }), msg(2, { reply_to: "m1", status: "open" })]);
    expect(filter_threads(t, "asks", ctx).map((x) => x.root.seq)).toEqual([1]);
    // ...and the matching message is identifiable for highlight/force-show.
    expect(msg_matches_filter(t[0].replies[0], "asks", ctx)).toBe(true);
    expect(msg_matches_filter(t[0].root, "asks", ctx)).toBe(false);
  });
});

describe("badges + hue", () => {
  it("groups inbox envelopes into per-channel unread counts and seq sets", () => {
    const inbox = [
      { channel: "commons", seq: 5 },
      { channel: "commons", seq: 7 },
      { channel: "entity-society", seq: 2 },
      { channel: "" },
    ];
    expect(unread_by_channel(inbox)).toEqual({ commons: 2, "entity-society": 1 });
    const sets = unread_seqs_by_channel(inbox);
    expect([...sets["commons"]].sort()).toEqual([5, 7]);
    expect(sets["entity-society"].has(2)).toBe(true);
  });

  it("badge count dedups (channel, seq) so it always agrees with the Unread filter (dm 147b)", () => {
    // The hub's synthetic stale-client notice RIDES an existing channel+seq
    // (never stored, un-ackable) — a fold counting envelopes said "2
    // unread" while the seq-set filter showed 1. One truth: distinct seqs.
    const inbox = [
      { channel: "dm:framework--laurent", seq: 136, sender: "framework" },
      { channel: "dm:framework--laurent", seq: 136, sender: "hub" }, // synthetic twin
      { channel: "dm:framework--laurent", seq: 211 },
    ];
    const counts = unread_by_channel(inbox);
    const sets = unread_seqs_by_channel(inbox);
    expect(counts["dm:framework--laurent"]).toBe(2);
    expect(counts["dm:framework--laurent"]).toBe(sets["dm:framework--laurent"].size);
    // Seq-less envelopes still count (never hide a message), never collide.
    expect(unread_by_channel([{ channel: "c" }, { channel: "c" }])).toEqual({ c: 2 });
  });

  it("sender hue is deterministic and in range", () => {
    expect(sender_hue("core")).toBe(sender_hue("core"));
    for (const s of ["core", "gateway", "laurent", "x"]) {
      const h = sender_hue(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe("serialize_transcript", () => {
  it("keeps seq order and carries asks/answers/to metadata", () => {
    const out = serialize_transcript([
      msg(2, { title: "t2", data: { answers: ["1"] }, reply_to: "m1", status: "reply" }),
      msg(1, { title: "t1", status: "open", to: ["gateway"], data: { asks: [{ id: "1", text: "confirm?" }] } }),
    ]);
    expect(out.indexOf("#1 ")).toBeLessThan(out.indexOf("#2 "));
    expect(out).toContain('asks=1:"confirm?"');
    expect(out).toContain("answers=[1]");
    expect(out).toContain("to=[gateway]");
    expect(out).not.toContain("#TRUNCATION");
  });

  it("drops the OLDEST messages under budget pressure with a labeled #TRUNCATION header, inside the budget", () => {
    const ms = Array.from({ length: 10 }, (_, i) => msg(i + 1, { body: "x".repeat(500) }));
    const budget = 1600;
    const out = serialize_transcript(ms, { char_budget: budget });
    expect(out).toContain("#TRUNCATION");
    expect(out).not.toContain("#1 [");
    expect(out).toContain("#10 [");
    // The header is counted against the budget, not stacked on top.
    expect(out.length).toBeLessThanOrEqual(budget);
  });

  it("clamps a single message larger than the budget in place, labeled (one giant message cannot blow the context)", () => {
    const out = serialize_transcript([msg(1, { body: "y".repeat(100_000) })], { char_budget: 2000 });
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain("[#TRUNCATION: message #1 clamped");
  });
});

describe("autolink_body (operator dm 39/44: pasted URLs clickable; hub-internal images embed)", () => {
  it("wraps a bare external URL in a markdown link, trimming trailing prose punctuation", () => {
    expect(autolink_body("see https://example.com/docs.")).toBe("see [https://example.com/docs](https://example.com/docs).");
  });

  it("embeds an app-origin image URL as a markdown image (hub-internal scope)", () => {
    expect(autolink_body("shot: http://127.0.0.1:3002/api/hub/channels/commons/attachments/abc.png", { app_origin: "http://127.0.0.1:3002" })).toBe(
      "shot: ![image](http://127.0.0.1:3002/api/hub/channels/commons/attachments/abc.png)"
    );
  });

  it("rewrites a pasted hub attachment URL onto the proxy path and embeds when it is an image", () => {
    const body = "grab http://127.0.0.1:8765/channels/commons/attachments/sha256abc.png here";
    expect(autolink_body(body, { hub_base: "http://127.0.0.1:8765" })).toBe(
      "grab ![image](/api/hub/channels/commons/attachments/sha256abc.png) here"
    );
  });

  it("links (never embeds) external image URLs — his ruling scopes embedding to hub-internal content", () => {
    const body = "look https://attacker.example/pix.png";
    expect(autolink_body(body)).toBe("look [https://attacker.example/pix.png](https://attacker.example/pix.png)");
  });

  it("leaves URLs inside code fences, inline code, and existing markdown links untouched", () => {
    const fenced = "```\nhttps://a.dev/x\n```";
    expect(autolink_body(fenced)).toBe(fenced);
    const inline = "run `curl https://a.dev/x` now";
    expect(autolink_body(inline)).toBe(inline);
    const linked = "[docs](https://a.dev/x)";
    expect(autolink_body(linked)).toBe(linked);
  });

  it("returns text without URLs unchanged (fast path)", () => {
    expect(autolink_body("no links here")).toBe("no links here");
  });

  it("URL-shaped but unparseable tokens stay plain text instead of throwing (operator dm 55 crash: literal-ellipsis host)", () => {
    const body = "see https://…/pic.png for the shape";
    expect(autolink_body(body)).toBe(body);
  });
});

describe("neutralize_unsafe_embeds (zero-click read-receipt forgery via CSP img-src 'self' + same-origin proxy)", () => {
  it("defangs an <img> smuggle to the side-effecting read_message GET route", () => {
    const evil = "![x](/api/hub/channels/commons/messages/01ABC)";
    const out = neutralize_unsafe_embeds(evil);
    expect(out).not.toContain("](/api/hub");
    expect(out).toContain("(blocked link)");
  });

  it("defangs a same-origin LINK to any non-attachment proxy route (one-click fire)", () => {
    const evil = "[see](/api/hub/channels/commons/messages/01ABC)";
    expect(neutralize_unsafe_embeds(evil)).toContain("(blocked link)");
  });

  it("LEAVES a legitimate hub attachment embed untouched (content-addressed, side-effect-free)", () => {
    const ok = "![shot](/api/hub/channels/commons/attachments/sha256abc)";
    expect(neutralize_unsafe_embeds(ok)).toBe(ok);
  });

  it("defangs the parser-differential bypass: a whitespace+dot-segment tail hidden past an attachment prefix (adversary b22b19ed P1)", () => {
    // The href LOOKS like an attachment up to the first space, but the kit
    // captures to ")" and the browser normalizes the ../ tail into a
    // side-effecting read_message GET. Capturing to ")" + rejecting
    // whitespace/.. under /api catches it.
    const evil = "![x](/api/hub/channels/commons/attachments/z /../../messages/CRITID01)";
    const out = neutralize_unsafe_embeds(evil);
    expect(out).toContain("(blocked link)");
    expect(out).not.toContain("](/api/hub");
  });

  it("defangs a bare '..' traversal under /api even without whitespace", () => {
    const evil = "![x](/api/hub/channels/c/attachments/../../messages/ID)";
    expect(neutralize_unsafe_embeds(evil)).toContain("(blocked link)");
  });

  it("leaves external and data: targets untouched (CSP bounds those)", () => {
    const ext = "[docs](https://example.com/x)";
    expect(neutralize_unsafe_embeds(ext)).toBe(ext);
    const noop = "no links here";
    expect(neutralize_unsafe_embeds(noop)).toBe(noop);
  });

  it("composes with autolink: a rewritten hub attachment URL stays embeddable, a messages route does not", () => {
    // autolink turns a pasted hub image URL into ![image](/api/hub/.../attachments/..) — must survive.
    const linked = autolink_body("![image](/api/hub/channels/commons/attachments/abc)");
    expect(neutralize_unsafe_embeds(linked)).toContain("attachments/abc");
  });
});

describe("extract_fs_paths (operator dm 69: fs paths in messages open the viewer)", () => {
  it("extracts the path from an fs:put write notice (title-style line)", () => {
    expect(extract_fs_paths("fs:put plans/improving-entity-capabilities.md")).toEqual(["plans/improving-entity-capabilities.md"]);
  });

  it("extracts path mentions from prose, deduped in order, capped at 4", () => {
    const text = "see plans/a.md and reports/b.md (also plans/a.md) plus x/c.md y/d.md z/e.md";
    expect(extract_fs_paths(text)).toEqual(["plans/a.md", "reports/b.md", "x/c.md", "y/d.md"]);
  });

  it("ignores URL paths and proxy routes (autolink owns those)", () => {
    expect(extract_fs_paths("read https://example.com/docs/guide.md please")).toEqual([]);
    expect(extract_fs_paths("GET /api/hub/channels/commons/fs/plans/a.md")).toEqual([]);
  });

  it("requires a directory segment and a text-ish extension (no bare filenames, no binaries)", () => {
    expect(extract_fs_paths("just notes.md alone")).toEqual([]);
    expect(extract_fs_paths("binary assets/logo.png here")).toEqual([]);
  });
});

describe("parse_member_list (operator dm 71: the composer group kind's member field)", () => {
  it("accepts @-prefixed or bare names, space/comma separated, deduped, lowercased", () => {
    expect(parse_member_list("@entity @assistant, gateway; @Entity")).toEqual(["entity", "assistant", "gateway"]);
  });

  it("drops tokens that cannot be hub ids", () => {
    expect(parse_member_list("@entity !!! -bad @@x")).toEqual(["entity"]);
    expect(parse_member_list("")).toEqual([]);
  });
});

describe("parse_group + group_slug (/group parity with agora chat/CLI 0.12.10)", () => {
  it("parses interleaved mentions into (title, roster) — order kept, dupes dropped, case folded", () => {
    const { title, members } = parse_group("Fix voice @Gateway @core then verify with @entity @gateway");
    expect(members).toEqual(["gateway", "core", "entity"]);
    expect(title).toBe("Fix voice then verify with");
  });

  it("returns empty members for a mentionless line (caller shows usage, never creates)", () => {
    expect(parse_group("just some text").members).toEqual([]);
  });

  it("slugs the topic: lowercase, dashed, capped at 40, uniqued with -2/-3", () => {
    expect(group_slug("Fix the Voice Outage!", new Set())).toBe("fix-the-voice-outage");
    expect(group_slug("Fix the Voice Outage!", new Set(["fix-the-voice-outage"]))).toBe("fix-the-voice-outage-2");
    expect(group_slug("x".repeat(60), new Set()).length).toBeLessThanOrEqual(40);
    expect(group_slug("", new Set())).toBe("group");
    // The hub's create_channel refuses spaces/slashes — born clean.
    expect(group_slug("a b/c:d", new Set())).toMatch(/^[a-z0-9_.-]+$/);
  });
});

describe("fs_children (operator dm 53: Drive-style folders over the flat hub fs)", () => {
  const entries = [
    { path: "readme.md" },
    { path: "plans/alpha.md" },
    { path: "plans/beta.md" },
    { path: "plans/deep/gamma.md" },
    { path: "reports/night.md" },
  ];

  it("lists root: derived folders (with recursive counts) then direct files", () => {
    const { dirs, leaves } = fs_children(entries, "");
    expect(dirs).toEqual([
      { name: "plans", path: "plans", count: 3 },
      { name: "reports", path: "reports", count: 1 },
    ]);
    expect(leaves.map((l) => l.path)).toEqual(["readme.md"]);
  });

  it("descends one level: subfolders and direct leaves of the cwd only", () => {
    const { dirs, leaves } = fs_children(entries, "plans");
    expect(dirs).toEqual([{ name: "deep", path: "plans/deep", count: 1 }]);
    expect(leaves.map((l) => l.path)).toEqual(["plans/alpha.md", "plans/beta.md"]);
  });

  it("an empty folder path never matches partial segment names", () => {
    const { dirs, leaves } = fs_children([{ path: "plansB/x.md" }, { path: "plans/y.md" }], "plans");
    expect(dirs).toEqual([]);
    expect(leaves.map((l) => l.path)).toEqual(["plans/y.md"]);
  });
});

describe("dm_peer_of (operator dm 84: in-dm posts must address the peer)", () => {
  it("resolves the counterpart from the sorted-pair name, hyphen-safe", () => {
    expect(dm_peer_of("dm:continuum--laurent", "continuum")).toBe("laurent");
    expect(dm_peer_of("dm:continuum--laurent", "laurent")).toBe("continuum");
    // Seats with hyphens survive (suffix matching, never naive split).
    expect(dm_peer_of("dm:flow-react--laurent", "flow-react")).toBe("laurent");
    expect(dm_peer_of("dm:flow-react--laurent", "laurent")).toBe("flow-react");
  });

  it("returns empty for non-dm channels or a seat outside the pair", () => {
    expect(dm_peer_of("commons", "laurent")).toBe("");
    expect(dm_peer_of("dm:a--b", "c")).toBe("");
    expect(dm_peer_of("dm:a--b", "")).toBe("");
  });
});

describe("compose_status (operator dm 86: every dm is an ASK)", () => {
  it("in-dm non-replies post as open (owed until discharged)", () => {
    expect(compose_status({ is_reply: false, in_dm: true, kind: "fyi" })).toBe("open");
    expect(compose_status({ is_reply: false, in_dm: true, kind: "ask" })).toBe("open");
  });

  it("replies stay replies everywhere (they discharge, never re-open)", () => {
    expect(compose_status({ is_reply: true, in_dm: true, kind: "fyi" })).toBe("reply");
    expect(compose_status({ is_reply: true, in_dm: false, kind: "ask" })).toBe("reply");
  });

  it("rooms keep the fyi baseline; only the ask kind opens", () => {
    expect(compose_status({ is_reply: false, in_dm: false, kind: "fyi" })).toBe("fyi");
    expect(compose_status({ is_reply: false, in_dm: false, kind: "ask" })).toBe("open");
  });
});

describe("replied_ids (client-side discharge fold — adversarial find 1)", () => {
  it("counts replies from another party; self-continuations do not calm", () => {
    const msgs = [
      { id: "a", sender: "laurent", reply_to: null },
      { id: "b", sender: "laurent", reply_to: "a" }, // self follow-up
      { id: "c", sender: "continuum", reply_to: "a" }, // real answer
    ];
    const ids = replied_ids(msgs);
    expect(ids.has("a")).toBe(true);
    // Remove the real answer: only the self-reply remains -> not calmed.
    expect(replied_ids(msgs.slice(0, 2)).has("a")).toBe(false);
  });

  it("a reply whose root fell out of the window still counts (calm-down beats vigilance)", () => {
    expect(replied_ids([{ id: "z", sender: "x", reply_to: "gone" }]).has("gone")).toBe(true);
  });
});

describe("resolved filter (operator dm 90: resolved threads must surface)", () => {
  it("a thread closed by a resolved REPLY matches even when the root stays open", () => {
    const root = { id: "r", seq: 1, sender: "a", status: "open", body: "ask" } as any;
    const closure = { id: "c", seq: 2, sender: "b", status: "resolved", reply_to: "r", body: "Resolved." } as any;
    const threads = group_threads([root, closure]);
    const ctx = { seat: "laurent" } as any;
    expect(filter_threads(threads, "resolved", ctx).length).toBe(1);
    // And an untouched open thread stays out of Resolved.
    const open_only = group_threads([{ id: "x", seq: 3, sender: "a", status: "open", body: "still open" } as any]);
    expect(filter_threads(open_only, "resolved", ctx).length).toBe(0);
  });
});

describe("retracted messages (operator dm 88 + agora 0097)", () => {
  const retracted = { id: "r1", seq: 5, sender: "laurent", status: "fyi", retracted: true, body: "[retracted by laurent]" } as any;

  it("exist only in All and (while unread) Unread — every triage lens excludes them", () => {
    const ctx_read = { seat: "continuum" } as any;
    const ctx_unread = { seat: "continuum", unread_seqs: new Set([5]) } as any;
    expect(msg_matches_filter(retracted, "all", ctx_read)).toBe(true);
    expect(msg_matches_filter(retracted, "unread", ctx_read)).toBe(false);
    expect(msg_matches_filter(retracted, "unread", ctx_unread)).toBe(true);
    for (const f of ["asks", "vigilance", "fyi", "resolved", "to_me"] as const) {
      expect(msg_matches_filter({ ...retracted, status: "open", to: ["continuum"], critical: true }, f, ctx_unread)).toBe(false);
    }
  });
});

describe("resolve_fs_mention (operator dm 93: no chip without a real target)", () => {
  const fs = new Set(["plans/roadmap.md", "reports/audit.md", "notes/audit.md"]);

  it("exact fs path wins", () => {
    expect(resolve_fs_mention("plans/roadmap.md", fs, [])).toEqual({ kind: "fs", path: "plans/roadmap.md", rewritten: false });
  });

  it("unique basename match resolves a moved file; ambiguous basenames refuse to guess", () => {
    expect(resolve_fs_mention("old/place/roadmap.md", fs, [])).toEqual({ kind: "fs", path: "plans/roadmap.md", rewritten: true });
    // audit.md exists twice -> no fs guess, falls to attachments (none) -> null.
    expect(resolve_fs_mention("workspace/audit.md", fs, [])).toBeNull();
  });

  it("attachment on the message resolves a foreign-workspace path (the dm-93 case)", () => {
    const atts = [{ filename: "gap_july18_19.md" }];
    expect(resolve_fs_mention("workspace/world_models/gap_july18_19.md", fs, atts)).toEqual({ kind: "attachment", attachment_index: 0 });
    // Full-path attachment filenames (the hub stores them verbatim) match too.
    expect(resolve_fs_mention("workspace/world_models/gap_july18_19.md", fs, [{ filename: "workspace/world_models/gap_july18_19.md" }])).toEqual({ kind: "attachment", attachment_index: 0 });
  });

  it("EXACT attachment beats the fs basename guess (adversarial find 2)", () => {
    // fs holds plans/notes.md; the message CARRIES workspace/notes.md.
    const fs2 = new Set(["plans/notes.md"]);
    expect(resolve_fs_mention("workspace/notes.md", fs2, [{ filename: "workspace/notes.md" }])).toEqual({ kind: "attachment", attachment_index: 0 });
    // Without the exact attachment, the unique fs basename still resolves.
    expect(resolve_fs_mention("workspace/notes.md", fs2, [])).toEqual({ kind: "fs", path: "plans/notes.md", rewritten: true });
  });

  it("exact attachment match wins over an earlier basename collision (adversarial find 3)", () => {
    const atts = [{ filename: "workspace/a/notes.md" }, { filename: "workspace/b/notes.md" }];
    expect(resolve_fs_mention("workspace/b/notes.md", null, atts)).toEqual({ kind: "attachment", attachment_index: 1 });
  });

  it("unknown fs state (null listing): only attachment matches chip — never an unverifiable fs guess", () => {
    expect(resolve_fs_mention("plans/roadmap.md", null, [])).toBeNull();
    expect(resolve_fs_mention("plans/roadmap.md", null, [{ filename: "roadmap.md" }])).toEqual({ kind: "attachment", attachment_index: 0 });
  });
});

describe("debt_seqs_by_channel (dm 111: sticky debts are not clickable-clear unread)", () => {
  it("open/blocked pin everyone; addressed reply/fyi pin only the addressee", () => {
    const inbox = [
      { channel: "c", seq: 1, status: "open", to: [] },
      { channel: "c", seq: 2, status: "blocked", to: ["someone"] },
      { channel: "c", seq: 3, status: "fyi", to: ["laurent"] },
      { channel: "c", seq: 4, status: "fyi", to: ["other"] },
      { channel: "c", seq: 5, status: "reply", to: ["laurent"] },
      { channel: "c", seq: 6, status: "reply", to: null },
    ];
    const debts = debt_seqs_by_channel(inbox, "laurent");
    expect([...debts["c"]].sort()).toEqual([1, 2, 3, 5]);
  });

  it("empty seat never claims directive debts", () => {
    expect(debt_seqs_by_channel([{ channel: "c", seq: 3, status: "fyi", to: ["laurent"] }], "")["c"]).toBeUndefined();
  });
});

describe("reflow_prose_walls (operator dm 121: single-paragraph report walls)", () => {
  const filler = "the sweeper lane watches entities between requests and closes the blind window to seconds for every home on this gateway process tonight. ";
  const wall = `You asked what the item is. In plain terms today nothing watches. ${filler}${filler} (1) DYING-BREATH NOTIFY — the loop process already writes on its way out. ${filler} (2) SWEEPER BACKSTOP — a background thread waking every 30min. ${filler} WHY IT IS NOT BUILT: half one is another seat's code. ${filler}`;

  it("inserts paragraph breaks before enumerators and ALL-CAPS transitions — words verbatim", () => {
    const out = reflow_prose_walls(wall);
    expect(out).not.toBe(wall);
    expect(out).toContain("\n\n(1) DYING-BREATH");
    expect(out).toContain("\n\n(2) SWEEPER");
    expect(out).toContain("\n\nWHY IT IS NOT BUILT:");
    // Whitespace-only transform: every author word survives byte-exact.
    expect(out.replace(/\s+/g, " ")).toBe(wall.replace(/\s+/g, " "));
  });

  it("leaves short prose, structured text, and single-enumerator prose alone", () => {
    expect(reflow_prose_walls("see (1) above.")).toBe("see (1) above.");
    const structured = `intro\n\n- a\n- b\n\n${wall}`;
    // Blocks that already have newlines inside stay untouched; only the
    // wall block reflows.
    expect(reflow_prose_walls(structured)).toContain("- a\n- b");
    const one_point = `${filler}${filler}${filler} Only one marker here. (1) alone is prose, not a list.`;
    expect(reflow_prose_walls(one_point)).toBe(one_point);
  });

  it("never touches code fences or inline code spans", () => {
    const fenced = "```\n" + wall + "\n```";
    expect(reflow_prose_walls(fenced)).toBe(fenced);
    const with_span = `${wall} and \`call(1). THEN RUN(2). DONE(3). MORE(4).\``;
    const out = reflow_prose_walls(with_span);
    expect(out).toContain("`call(1). THEN RUN(2). DONE(3). MORE(4).`");
  });
});

describe("escalated_seqs_by_channel (backlog 0010: hub escalation axes)", () => {
  it("collects escalated=true and effective_urgency=interrupt; ignores calm lanes", () => {
    const inbox = [
      { channel: "c", seq: 1, escalated: true, effective_urgency: "inbox" },
      { channel: "c", seq: 2, escalated: false, effective_urgency: "interrupt" },
      { channel: "c", seq: 3, escalated: false, effective_urgency: "inbox" },
      { channel: "c", seq: 4, effective_urgency: "next_turn" },
      { channel: "d", seq: 9, escalated: true },
      { channel: "", seq: 5, escalated: true }, // malformed — dropped
    ];
    const out = escalated_seqs_by_channel(inbox);
    expect([...out["c"]].sort()).toEqual([1, 2]);
    expect([...out["d"]]).toEqual([9]);
    expect(Object.keys(out).sort()).toEqual(["c", "d"]);
  });
});

describe("snippet_spans (agora-0132 search: code-point highlight offsets)", () => {
  it("splits plain ASCII around one mark", () => {
    // "the kelp rollout" with "kelp" marked: start 4, len 4.
    expect(snippet_spans("the kelp rollout", [[4, 4]])).toEqual([
      { text: "the ", hit: false },
      { text: "kelp", hit: true },
      { text: " rollout", hit: false },
    ]);
  });

  it("counts CODE POINTS, not UTF-16 units (astral chars before the mark)", () => {
    // "🚀🚀 kelp" — each rocket is ONE code point (two UTF-16 units).
    // Hub offsets say the mark starts at code point 3; naive .slice(3)
    // would land mid-rocket and mark " ke" instead of "kelp".
    const spans = snippet_spans("🚀🚀 kelp", [[3, 4]]);
    expect(spans).toEqual([
      { text: "🚀🚀 ", hit: false },
      { text: "kelp", hit: true },
    ]);
  });

  it("merges forward on overlap and drops malformed pairs", () => {
    const spans = snippet_spans("abcdef", [
      [1, 3], // bcd
      [2, 3], // cde — overlaps; only the un-consumed tail (e) marks
      [-1, 2] as number[], // malformed — dropped
      [99, 2], // out of range — dropped
      [3, 0], // zero-length — dropped
    ]);
    expect(spans.map((s) => s.text).join("")).toBe("abcdef"); // lossless
    expect(spans).toEqual([
      { text: "a", hit: false },
      { text: "bcd", hit: true },
      { text: "e", hit: true },
      { text: "f", hit: false },
    ]);
  });

  it("clamps a mark that runs past the end and survives empty input", () => {
    expect(snippet_spans("ab", [[1, 99]])).toEqual([
      { text: "a", hit: false },
      { text: "b", hit: true },
    ]);
    expect(snippet_spans("", [[0, 2]])).toEqual([]);
    expect(snippet_spans("plain", null)).toEqual([{ text: "plain", hit: false }]);
  });
});

describe("SEARCH_SECTIONS (agora-0132: the six fixed sections, served order)", () => {
  it("pins the section order and the per-section recent-mode pivots", () => {
    expect(SEARCH_SECTIONS.map((s) => s.id)).toEqual(["decisions", "open_threads", "work", "people", "files", "messages"]);
    // open_threads mixes statuses — no single-kind pivot exists for it.
    expect(SEARCH_SECTIONS.find((s) => s.id === "open_threads")?.kind).toBeNull();
    expect(SEARCH_SECTIONS.find((s) => s.id === "people")?.kind).toBe("agent");
  });
});
