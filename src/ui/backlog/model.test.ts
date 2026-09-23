// Behavior pins for the backlog model helpers, written BEFORE the
// backlog_browser split (2026-07-12) so the split cannot silently change
// template rendering, exec summaries, status filters, or stats folding.
import { describe, expect, it } from "vitest";

import {
  exec_event_stats,
  exec_status_chip_class,
  exec_status_filter_for_view,
  exec_summary_from_payload,
  exec_time_stats,
  format_created_at,
  format_duration_ms,
  generate_backlog_draft_from_guided,
  infer_backlog_package,
  insert_attachment_links,
  is_backlog_file_kind,
  is_known_task_type,
  is_parsed,
  lines_list,
  normalize_task_type,
  read_task_type,
  task_type_title,
  WORK_ITEM_TYPES,
  parse_exec_events,
  parse_iso_ms,
  render_backlog_template_draft,
  session_memory_run_id,
  short_id,
  strip_title_type_prefix,
  summary_preview_markdown,
  task_type_chip,
} from "./model";

describe("backlog model basics", () => {
  it("classifies tabs into file kinds vs exec views", () => {
    expect(is_backlog_file_kind("planned")).toBe(true);
    expect(is_backlog_file_kind("trash")).toBe(true);
    expect(is_backlog_file_kind("processing")).toBe(false);
    expect(is_backlog_file_kind("failed")).toBe(false);
  });

  it("normalizes task types with a task fallback (WRITE-side clamp only)", () => {
    expect(normalize_task_type("BUG")).toBe("bug");
    expect(normalize_task_type(" feature ")).toBe("feature");
    expect(normalize_task_type("improvement")).toBe("improvement");
    expect(normalize_task_type("weird")).toBe("task");
    expect(normalize_task_type(null)).toBe("task");
  });

  it("read side is OPEN (c1123): as-written, labeled unknown, never coerced", () => {
    expect(WORK_ITEM_TYPES).toEqual(["bug", "feature", "improvement", "task"]);
    expect(read_task_type(" Enhancement ")).toBe("enhancement"); // as-written, only case-normalized
    expect(read_task_type(null)).toBe("");
    expect(is_known_task_type("improvement")).toBe(true);
    expect(is_known_task_type("enhancement")).toBe(false);
    // Unknown values get the labeled-unknown look + tooltip, never a known color.
    expect(task_type_chip("enhancement")).toBe("muted");
    expect(task_type_title("enhancement")).toContain("not in the ruled type vocabulary");
    expect(task_type_title("improvement")).toBeUndefined();
  });

  it("maps task types to chip classes", () => {
    expect(task_type_chip("bug")).toBe("danger");
    expect(task_type_chip("feature")).toBe("ok");
    expect(task_type_chip("improvement")).toBe("info");
    expect(task_type_chip("task")).toBe("task");
  });

  it("strips [type] prefixes from titles", () => {
    expect(strip_title_type_prefix("[BUG] Fix the door")).toBe("Fix the door");
    expect(strip_title_type_prefix("[feature]   Add a door")).toBe("Add a door");
    expect(strip_title_type_prefix("[improvement] Faster doors")).toBe("Faster doors");
    expect(strip_title_type_prefix("No prefix")).toBe("No prefix");
  });

  it("shortens ids with an ellipsis", () => {
    expect(short_id("abcdef", 10)).toBe("abcdef");
    expect(short_id("abcdefghijk", 6)).toBe("abcde…");
  });

  it("detects parsed items via flag or item_id", () => {
    expect(is_parsed({ parsed: true, item_id: 0 } as any)).toBe(true);
    expect(is_parsed({ parsed: false, item_id: 7 } as any)).toBe(false);
    expect(is_parsed({ item_id: 7 } as any)).toBe(true);
    expect(is_parsed({ item_id: 0 } as any)).toBe(false);
  });

  it("infers package from filename when missing", () => {
    expect(infer_backlog_package({ package: "core" } as any)).toBe("core");
    expect(infer_backlog_package({ package: "", filename: "0042-gateway-fix-doors.md" } as any)).toBe("gateway");
    expect(infer_backlog_package(null)).toBe("");
  });

  it("keeps the first paragraph (max 6 lines) as summary preview", () => {
    expect(summary_preview_markdown("a\nb\n\nc")).toBe("a\nb");
    expect(summary_preview_markdown("\n\n  \nx")).toBe("x");
    expect(summary_preview_markdown("1\n2\n3\n4\n5\n6\n7")).toBe("1\n2\n3\n4\n5\n6");
  });
});

describe("time helpers", () => {
  it("parses ISO timestamps with long fractional seconds", () => {
    expect(parse_iso_ms("2026-07-12T10:00:00.123456789Z")).toBe(Date.parse("2026-07-12T10:00:00.123Z"));
    expect(parse_iso_ms("")).toBeNull();
    expect(parse_iso_ms("not-a-date")).toBeNull();
  });

  it("formats durations at the right granularity", () => {
    expect(format_duration_ms(12_000)).toBe("12s");
    expect(format_duration_ms(3 * 60_000 + 5_000)).toBe("3m 5s");
    expect(format_duration_ms(2 * 3_600_000 + 60_000)).toBe("2h 1m");
    expect(format_duration_ms(26 * 3_600_000)).toBe("1d 2h");
    expect(format_duration_ms(NaN)).toBe("");
  });

  it("formats created_at with a timezone offset", () => {
    const s = format_created_at(new Date("2026-07-12T10:20:30"));
    expect(s).toMatch(/^2026-07-12 10:20:30 [+-]\d{4}$/);
  });

  it("computes exec time stats for a finished request", () => {
    const stats = exec_time_stats(
      {
        request_id: "r1",
        status: "completed",
        created_at: "2026-07-12T10:00:00Z",
        started_at: "2026-07-12T10:00:30Z",
        finished_at: "2026-07-12T10:10:30Z",
      } as any,
      Date.parse("2026-07-12T11:00:00Z")
    );
    expect(stats.is_done).toBe(true);
    expect(stats.queue_delay_ms).toBe(30_000);
    expect(stats.run_ms).toBe(600_000);
    expect(stats.total_ms).toBe(630_000);
    expect(stats.age_ms).toBeNull();
  });

  it("computes live age for a running request", () => {
    const now = Date.parse("2026-07-12T10:05:00Z");
    const stats = exec_time_stats(
      { request_id: "r1", status: "running", created_at: "2026-07-12T10:00:00Z", started_at: "2026-07-12T10:01:00Z" } as any,
      now
    );
    expect(stats.is_done).toBe(false);
    expect(stats.age_ms).toBe(300_000);
    expect(stats.run_ms).toBe(240_000);
  });
});

describe("exec pipeline model", () => {
  it("maps statuses to chip classes", () => {
    expect(exec_status_chip_class("completed")).toBe("ok");
    expect(exec_status_chip_class("promoted")).toBe("ok");
    expect(exec_status_chip_class("failed")).toBe("danger");
    expect(exec_status_chip_class("running")).toBe("info");
    expect(exec_status_chip_class("queued")).toBe("warn");
    expect(exec_status_chip_class("awaiting_qa")).toBe("warn");
    expect(exec_status_chip_class("whatever")).toBe("muted");
  });

  it("maps tabs to exec status filters", () => {
    expect(exec_status_filter_for_view("processing", "tasks")).toBe("queued,running,awaiting_qa");
    expect(exec_status_filter_for_view("failed", "tasks")).toBe("failed");
    expect(exec_status_filter_for_view("completed", "runs")).toBe("completed,promoted");
    expect(exec_status_filter_for_view("completed", "tasks")).toBe("");
    expect(exec_status_filter_for_view("planned", "tasks")).toBe("");
  });

  it("folds a request payload into the summary shape", () => {
    const payload = {
      status: "awaiting_qa",
      created_at: "c",
      started_at: "s",
      finished_at: null,
      backlog: { relpath: "docs/backlog/planned/0001-x.md", kind: "planned", filename: "0001-x.md" },
      executor: { type: "codex_cli", model: "gpt-5.2", reasoning_effort: "high" },
      result: { ok: true, exit_code: 0, last_message: "m".repeat(2000) },
      run_dir_relpath: "runs/r1",
    };
    const out = exec_summary_from_payload(payload, "req_1");
    expect(out.request_id).toBe("req_1");
    expect(out.status).toBe("awaiting_qa");
    expect(out.backlog_filename).toBe("0001-x.md");
    expect(out.target_model).toBe("gpt-5.2");
    expect(out.target_reasoning_effort).toBe("high");
    expect(out.executor_type).toBe("codex_cli");
    expect(out.ok).toBe(true);
    expect(out.exit_code).toBe(0);
    // Bounded to 1200 chars, and the cut names itself (never a silent truncation).
    expect(out.last_message?.startsWith("m".repeat(1200) + "\n")).toBe(true);
    expect(out.last_message).toContain("[#TRUNCATION: 1200 of 2000 chars");
    expect(exec_summary_from_payload(null, "r").status).toBe("unknown");
  });

  it("parses exec JSONL, keeping unparsable lines as raw", () => {
    const parsed = parse_exec_events('{"type":"turn.completed"}\nnot json\n{"event":"other"}\n\n');
    expect(parsed.total).toBe(3);
    expect(parsed.bad).toBe(1);
    expect(parsed.events.map((e) => e.type)).toEqual(["turn.completed", "raw", "other"]);
  });

  it("aggregates usage and command stats from events", () => {
    const parsed = parse_exec_events(
      [
        JSON.stringify({ type: "a", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10 } }),
        JSON.stringify({ type: "b", item: { type: "command_execution", status: "completed" } }),
        JSON.stringify({ type: "c", item: { type: "command_execution", status: "failed" } }),
        JSON.stringify({ type: "d", usage: { input_tokens: 1 } }),
      ].join("\n")
    );
    const stats = exec_event_stats(parsed)!;
    expect(stats.input_tokens).toBe(101);
    expect(stats.cached_input_tokens).toBe(40);
    expect(stats.output_tokens).toBe(10);
    expect(stats.total_tokens).toBe(111);
    expect(stats.command_count).toBe(2);
    expect(stats.command_fail_count).toBe(1);
    expect(stats.has_tokens).toBe(true);
    expect(exec_event_stats(null)).toBeNull();
  });
});

describe("voice session run ids", () => {
  it("uses safe session ids directly", async () => {
    expect(await session_memory_run_id("abc-123_x")).toBe("session_memory_abc-123_x");
  });

  it("hashes unsafe session ids", async () => {
    const rid = await session_memory_run_id("has spaces / slashes");
    expect(rid).toMatch(/^session_memory_sha_[0-9a-f]{32}$/);
  });

  it("rejects empty session ids", async () => {
    await expect(session_memory_run_id("")).rejects.toThrow();
  });
});

describe("draft rendering", () => {
  const template = ["# {ID}-{Package}: {Title}", "", "## Summary", "One paragraph describing what this does.", "", "## Related", "- ADRs:"].join("\n");

  it("renders the template with header, created, type, and summary", () => {
    const out = render_backlog_template_draft(template, {
      package_name: "continuum",
      title: "[bug] Fix the pipeline",
      summary: "The pipeline breaks.",
      created_at: "2026-07-12 10:00:00 +0200",
      task_type: "bug",
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe("# {ID}-continuum: [BUG] Fix the pipeline");
    expect(out).toContain("> Created: 2026-07-12 10:00:00 +0200");
    expect(out).toContain("> Type: bug");
    expect(out).toContain("The pipeline breaks.");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("splits guided text fields into list rows", () => {
    expect(lines_list(" a \n\n b\r\nc ")).toEqual(["a", "b", "c"]);
  });

  it("generates a guided draft with all sections", () => {
    const out = generate_backlog_draft_from_guided({
      package_name: "continuum",
      title: "Do the thing",
      task_type: "feature",
      summary: "Sum",
      diagram: "A -> B",
      context: "Because",
      included: ["x"],
      excluded: [],
      plan: ["p1", "p2"],
      dependencies: [],
      acceptance: ["works"],
      tests_a: ["npm test"],
      tests_b: [],
      tests_c: [],
      created_at: "2026-07-12 10:00:00 +0200",
      attachments: ["docs/backlog/assets/1/a.png"],
    });
    expect(out).toContain("# {ID}-continuum: [FEATURE] Do the thing");
    expect(out).toContain("## Scope");
    expect(out).toContain("- x");
    expect(out).toContain("1. p1");
    expect(out).toContain("2. p2");
    expect(out).toContain("- [ ] works");
    expect(out).toContain("  - `npm test`");
    expect(out).toContain("  - docs/backlog/assets/1/a.png");
    expect(out).toContain("## Report (added when completed)");
  });

  it("appends a Related section when missing", () => {
    const out = insert_attachment_links("# T\n\nbody", ["a/b.png"]);
    expect(out).toContain("## Related");
    expect(out).toContain("- Attachments:");
    expect(out).toContain("  - a/b.png");
  });

  it("appends entries after existing attachment entries (backlog 0006 fix)", () => {
    // Chronological order: the old walk trimmed lines before testing the
    // "  -" continuation prefix, so it broke at the first entry and new
    // attachments PREPENDED. Uploads must read oldest→newest.
    const md = ["# T", "", "## Related", "- Attachments:", "  - old.png", "", "---"].join("\n");
    const out = insert_attachment_links(md, ["new.png"]);
    const idx_old = out.indexOf("  - old.png");
    const idx_new = out.indexOf("  - new.png");
    expect(idx_old).toBeGreaterThan(-1);
    expect(idx_new).toBeGreaterThan(-1);
    expect(idx_new).toBeGreaterThan(idx_old);
    expect(out.indexOf("- Attachments:")).toBeLessThan(idx_old);
    // The new entry stays INSIDE the block — before the blank line + divider.
    expect(idx_new).toBeLessThan(out.indexOf("---"));
  });

  it("appends after deeper-indented or tab-indented entries (hand-edited files)", () => {
    const md = ["# T", "", "## Related", "- Attachments:", "    - deep.png", "\t- tabbed.png", "", "---"].join("\n");
    const out = insert_attachment_links(md, ["new.png"]);
    const idx_new = out.indexOf("  - new.png");
    expect(idx_new).toBeGreaterThan(out.indexOf("- tabbed.png"));
    expect(idx_new).toBeLessThan(out.indexOf("---"));
  });

  it("inserts an attachments block inside an existing Related section", () => {
    const md = ["# T", "", "## Related", "- ADRs:", "", "---", "end"].join("\n");
    const out = insert_attachment_links(md, ["x.png"]);
    expect(out).toContain("- Attachments:");
    expect(out.indexOf("- Attachments:")).toBeLessThan(out.indexOf("---"));
  });

  it("returns input unchanged for empty attachment lists", () => {
    expect(insert_attachment_links("# T", [])).toBe("# T");
  });
});
