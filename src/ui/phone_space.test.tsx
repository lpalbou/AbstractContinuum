// @vitest-environment jsdom
//
// Space on phones and tablets (DESIGN §12): the collapsible list panels
// (open by default, remembered per viewer, a real disclosure button), the
// phone stack of Executions and Inbox (the list stays above the detail in
// one page scroll, a pick scrolls the detail into view), and the space.css
// rules the phone layout depends on. Each test was seen red with its
// feature removed (see reports/continuum-space.md, "Mutations").
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardPage } from "./board/board_page";
import { ExecutionsPage } from "./executions_page";
import { ListDisclosure, list_open_key, read_list_open, write_list_open } from "./list_disclosure";
import { ReportInboxPage } from "./report_inbox";

// ---------------------------------------------------------------------------
// Controllable viewport width for use_media_query / reveal_on_phone.
let WIDTH = 1512;
function install_match_media(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query.split(",").some((part) => {
        const conds = [...part.matchAll(/\((max|min)-width:\s*([\d.]+)px\)/g)];
        return conds.length > 0 && conds.every(([, kind, px]) => (kind === "max" ? WIDTH <= Number(px) : WIDTH >= Number(px)));
      });
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

let scrolled: Element[] = [];

beforeEach(() => {
  WIDTH = 1512;
  scrolled = [];
  install_match_media();
  (Element.prototype as any).scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  // Run the "after the pick" reveal synchronously.
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe("list disclosure state", () => {
  it("is open by default, remembers a close, and survives blocked storage", () => {
    expect(read_list_open("x")).toBe(true);
    write_list_open("x", false);
    expect(localStorage.getItem(list_open_key("x"))).toBe("0");
    expect(read_list_open("x")).toBe(false);
    write_list_open("x", true);
    expect(read_list_open("x")).toBe(true);

    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(read_list_open("x", broken)).toBe(true);
    expect(() => write_list_open("x", false, broken)).not.toThrow();
  });

  it("renders a real button with aria-expanded and aria-controls", () => {
    const on_toggle = vi.fn();
    render(<ListDisclosure open={true} on_toggle={on_toggle} controls="the_list" title="Active" count={2} />);
    const btn = screen.getByRole("button", { name: /Active/ });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe("the_list");
    fireEvent.click(btn);
    expect(on_toggle).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
function make_board_gateway() {
  const planned = [{ kind: "planned", filename: "0001-x-ready.md", item_id: 1, package: "continuum", title: "Ready item", task_type: "feature", parsed: true }];
  return {
    backlog_list: vi.fn(async (kind: string) => ({ items: kind === "planned" ? planned : [] })),
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    backlog_exec_active_items: vi.fn(async () => ({ ok: true, items: [] })),
    backlog_content: vi.fn(async (kind: string, filename: string) => ({ kind, filename, content: "# t\n\n## Summary\nx\n" })),
    backlog_exec_config: vi.fn(async () => ({ ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex_cli" })),
    backlog_exec_request: vi.fn(async (id: string) => ({ ok: true, request_id: id, payload: { status: "running" } })),
  } as any;
}

function render_board(gw: any) {
  return render(<BoardPage gateway={gw} gateway_connected={true} data_nonce={0} on_mutated={() => {}} on_open_executions={() => {}} />);
}

describe("Board columns are collapsible list panels", () => {
  it("opens by default, a click hides the cards, and the choice is remembered across a remount", async () => {
    const gw = make_board_gateway();
    const first = render_board(gw);
    await screen.findByText("Ready item");
    const btn = document.querySelector('button.list_disclosure[aria-controls="board_column_body_ready"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const body = document.getElementById("board_column_body_ready") as HTMLElement;
    expect(body.hidden).toBe(false);
    expect(within(body).getByText("Ready item")).toBeTruthy();

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    expect(btn.closest(".board_column")?.classList.contains("list_collapsed")).toBe(true);
    expect(localStorage.getItem(list_open_key("board_column_ready"))).toBe("0");

    first.unmount();
    render_board(gw);
    await waitFor(() => expect(document.getElementById("board_column_body_ready")).toBeTruthy());
    expect(document.getElementById("board_column_body_ready")!.hidden).toBe(true);
    // Other columns keep their own (default open) state.
    expect(document.getElementById("board_column_body_triage")!.hidden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
function make_exec_gateway() {
  const active = [{ request_id: "req_run", status: "running", created_at: "2026-07-12T10:00:00Z", started_at: "2026-07-12T10:00:05Z", backlog_filename: "0004-live-item.md" }];
  const finished = [{ request_id: "req_done", status: "promoted", created_at: "2026-07-12T08:00:00Z", finished_at: "2026-07-12T08:10:05Z", backlog_filename: "0001-done-item.md" }];
  return {
    backlog_exec_config: vi.fn(async () => ({ ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex_cli" })),
    backlog_exec_requests: vi.fn(async (opts: any) => ({ ok: true, requests: String(opts?.status || "").includes("queued") ? active : finished })),
    backlog_exec_request: vi.fn(async (request_id: string) => ({ ok: true, request_id, payload: { status: "running" } })),
    backlog_exec_log_tail: vi.fn(async (args: any) => ({ ok: true, request_id: args.request_id, name: args.name, bytes: 0, truncated: false, content: "" })),
    admin_executors: vi.fn(async () => ({ executors: [] })),
    is_backing_off: () => false,
  } as any;
}

describe("Executions: collapsible lists, stacked above the detail on phones", () => {
  it("Active and Recently finished are disclosures, open by default and remembered", async () => {
    render(<ExecutionsPage gateway={make_exec_gateway()} gateway_connected={true} />);
    await screen.findByText("0004-live-item.md");
    const active = screen.getByRole("button", { name: /^Active/ });
    const recent = screen.getByRole("button", { name: /^Recently finished/ });
    expect(active.getAttribute("aria-expanded")).toBe("true");
    expect(recent.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(active);
    expect(active.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("exec_active_list")!.hidden).toBe(true);
    expect(document.getElementById("exec_recent_list")!.hidden).toBe(false);
    expect(localStorage.getItem(list_open_key("exec_active"))).toBe("0");
  });

  it("on a phone the list stays above the detail after a pick, and the pick scrolls the detail into view", async () => {
    WIDTH = 393;
    render(<ExecutionsPage gateway={make_exec_gateway()} gateway_connected={true} />);
    fireEvent.click(await screen.findByText("0004-live-item.md"));
    expect(await screen.findByText("Execution")).toBeTruthy();
    // Both halves are on the page (one scroll), not one pane at a time.
    expect(screen.getByText("0004-live-item.md", { selector: ".run_card_title" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Active/ })).toBeTruthy();
    const detail = document.querySelector(".exec_detail_pane");
    expect(detail).toBeTruthy();
    await waitFor(() => expect(scrolled).toContain(detail));
    // "Back" scrolls back up to the lists.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(scrolled).toContain(document.querySelector(".exec_side"));
  });

  it("on a desktop a pick does not scroll the page", async () => {
    render(<ExecutionsPage gateway={make_exec_gateway()} gateway_connected={true} />);
    fireEvent.click(await screen.findByText("0004-live-item.md"));
    expect(await screen.findByText("Execution")).toBeTruthy();
    expect(scrolled).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
function make_inbox_gateway() {
  const bugs = [{ report_type: "bug", filename: "2026-07-12-broken-door.md", relpath: "reports/bugs/2026-07-12-broken-door.md", title: "Broken door" }];
  return {
    list_triage_decisions: vi.fn(async () => ({ decisions: [] })),
    list_bug_reports: vi.fn(async () => ({ items: bugs })),
    list_feature_requests: vi.fn(async () => ({ items: [] })),
    get_bug_report_content: vi.fn(async (filename: string) => ({ report_type: "bug", filename, relpath: `reports/bugs/${filename}`, content: "# Bug body" })),
    email_list_accounts: vi.fn(async () => ({ ok: true, accounts: [] })),
  } as any;
}

describe("Inbox: the report list is a collapsible panel, stacked above the report on phones", () => {
  it("the list disclosure hides the list and is remembered", async () => {
    render(<ReportInboxPage gateway={make_inbox_gateway()} gateway_connected={true} enable_triage={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Bugs" }));
    await screen.findByText("Broken door");
    const btn = screen.getByRole("button", { name: /^Bug reports/ });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(document.getElementById("inbox_report_list")!.hidden).toBe(true);
    expect(document.querySelector(".inbox_layout")!.classList.contains("list_collapsed")).toBe(true);
    expect(localStorage.getItem(list_open_key("inbox_reports"))).toBe("0");
  });

  it("on a phone the list stays on the page after a pick and the report scrolls into view", async () => {
    WIDTH = 393;
    render(<ReportInboxPage gateway={make_inbox_gateway()} gateway_connected={true} enable_triage={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Bugs" }));
    fireEvent.click(await screen.findByText("Broken door"));
    expect(await screen.findByText("Bug body")).toBeTruthy();
    expect(document.querySelector(".inbox_layout")!.className).not.toMatch(/phone_detail/);
    expect(screen.getByText("Broken door")).toBeTruthy();
    expect(scrolled).toContain(document.querySelector(".inbox_detail_pane"));
  });
});

// ---------------------------------------------------------------------------
describe("space.css: the phone layout rules", () => {
  const css = readFileSync(resolve(__dirname, "space.css"), "utf8");

  /** Every block opened by `query`, joined. */
  function block(query: string): string {
    const out: string[] = [];
    for (let at = css.indexOf(query); at >= 0; at = css.indexOf(query, at + 1)) {
      let depth = 0;
      let i = at + query.length - 1;
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      out.push(css.slice(start, i + 1));
    }
    expect(out.length, `missing ${query}`).toBeGreaterThan(0);
    return out.join("\n");
  }

  const PHONE = "@media (max-width: 767.98px) {";

  it("is loaded after styles.css", () => {
    const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
    expect(main.indexOf('import "./ui/space.css";')).toBeGreaterThan(main.indexOf('import "./ui/styles.css";'));
  });

  it("uses only the named breakpoints", () => {
    const media = [...css.matchAll(/@media[^{]*/g)].map((m) => m[0]).join("\n");
    const widths = [...media.matchAll(/\((?:max|min)-width:\s*([\d.]+)px\)/g)].map((m) => m[1]);
    for (const w of widths) expect(["479.98", "767.98", "1023.98", "1439.98", "1440"]).toContain(w);
  });

  it("hides a collapsed list body even where the body is display:flex", () => {
    expect(css).toMatch(/\.list_collapsed \[hidden\] \{\s*display: none !important;/);
  });

  it("phones: list and detail panes are flat sections, rows are hairline items, no inner scroll", () => {
    const phone = block(PHONE);
    expect(phone).toMatch(/\.inbox_layout > \.pane,\s*\.exec_side > \.pane,\s*\.backlog_table_pane,\s*\.board_column \{\s*background: none;\s*border: 0;\s*border-radius: 0;\s*box-shadow: none;\s*overflow: visible;/);
    expect(phone).toMatch(/\.inbox_layout \.inbox_list,\s*\.exec_log_scroll,\s*\.exec_raw_log \{\s*overflow: visible;\s*max-height: none;/);
    expect(phone).toMatch(/\.run_card,\s*\.inbox_item \{\s*border: 0;/);
    expect(phone).toMatch(/\.exec_layout,\s*\.inbox_layout \{\s*display: flex;\s*flex-direction: column;/);
  });

  it("phones: label/value facts share a line, paths take the full width", () => {
    const phone = block(PHONE);
    expect(phone).toMatch(/\.fact \{\s*flex-direction: row;\s*flex-wrap: wrap;/);
    expect(phone).toMatch(/\.fact_wide \.fact_value,\s*\.fact_value\.mono \{\s*flex-basis: 100%;/);
  });

  it("phones: the open work drawer is the one scroll", () => {
    expect(block(PHONE)).toMatch(/\.page:has\(> \.drawer_backdrop\) > :not\(\.drawer_backdrop\) \{\s*visibility: hidden;/);
  });

  it("tablets keep two list/detail columns only at 360 px each; Team panes are flat below 1024", () => {
    expect(css).toMatch(/grid-template-columns: minmax\(360px, 42%\) minmax\(360px, 1fr\);/);
    expect(block("@media (max-width: 1023.98px) {")).toMatch(/\.team_layout > \.pane \{\s*background: none;\s*border: 0;/);
  });

  it("touch screens lift the kit type scale: small sizes 14 px, body 15 px, meta 12-13 px (DESIGN §12.1)", () => {
    const touch = block("@media (pointer: coarse) {");
    const px = (token: string) => Number((touch.match(new RegExp(`--font-size-${token}: calc\\((\\d+)px \\* var\\(--font-scale, 1\\)\\)`)) || [])[1]);
    expect(px("sm")).toBeGreaterThanOrEqual(14);
    expect(px("md")).toBeGreaterThanOrEqual(14);
    expect(px("base")).toBeGreaterThanOrEqual(14);
    expect(px("base")).toBeLessThanOrEqual(17);
    expect(px("xs")).toBeGreaterThanOrEqual(12);
    expect(px("xxs")).toBeGreaterThanOrEqual(12);
    expect(touch).toMatch(/:root \{/);
  });

  it("long paths wrap instead of being cut (review line, markdown)", () => {
    expect(css).toMatch(/\.work_review_meta \{[^}]*overflow-wrap: anywhere;/);
    expect(css).toMatch(/\.inbox_markdown,\s*\.md_doc \{\s*overflow-wrap: anywhere;/);
  });
});
