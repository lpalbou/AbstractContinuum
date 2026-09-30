// @vitest-environment jsdom
//
// Responsive BEHAVIOUR guards (review B, round 4: removing the nav drawer or
// the Team single pane kept every earlier test green). These drive the real
// components under a controllable matchMedia and pin:
//   - the nav drawer below 1024 px (hidden/inert when closed, focus in/out,
//     no focus theft on load, closes and docks the sidebar on crossing 1024);
//   - the Team single-pane state machine (channels -> thread -> back) and the
//     collapsed thread chrome ("More");
//   - the work-item drawer's Escape guard (never discards an edit, never
//     closes under a modal) and the modal consuming Escape;
//   - the stylesheet rules those states rely on.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../app";
import { WorkItemDrawer, escape_targets_editable } from "./board/work_item_drawer";
import { Modal } from "./modal";
import { TeamPage } from "./team_page";

// ---------------------------------------------------------------------------
// Controllable matchMedia: evaluates (max-width)/(min-width)/(max-height)
// against a mutable viewport; (pointer: coarse) is false (desktop test env).
let VIEW = { width: 1512, height: 982 };
const listeners = new Set<() => void>();

function evaluate(query: string): boolean {
  return query.split(",").some((part) => {
    const conds = [...part.matchAll(/\((max|min)-(width|height):\s*([\d.]+)px\)/g)];
    if (!conds.length) return false;
    return conds.every(([, kind, axis, px]) => {
      const v = axis === "width" ? VIEW.width : VIEW.height;
      return kind === "max" ? v <= Number(px) : v >= Number(px);
    });
  });
}

function install_match_media(): void {
  vi.stubGlobal("matchMedia", (query: string) => {
    const mql: any = {
      media: query,
      get matches() {
        return evaluate(query);
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
    };
    return mql;
  });
}

function resize(width: number, height = VIEW.height): void {
  VIEW = { width, height };
  act(() => {
    for (const fn of [...listeners]) fn();
  });
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = () => {};
  listeners.clear();
  install_match_media();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  VIEW = { width: 1512, height: 982 };
});

function stub_gateway_fetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      if (url.includes("api/connection/gateway")) {
        return new Response(
          JSON.stringify({ ok: true, gateway_url: "http://127.0.0.1:8080", has_session: true, gateway: { ok: true, principal: { user_id: "admin" } } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, runs: [], items: [], requests: [], processes: [], entities: [] }), { status: 200 });
    })
  );
}

const query_nav_drawer = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="complementary"][aria-label="Navigation"]');
const nav_drawer = (): HTMLElement => {
  const el = query_nav_drawer();
  if (!el) throw new Error("nav drawer not rendered");
  return el;
};

describe("nav drawer below 1024 px", () => {
  it("replaces the docked sidebar, stays hidden and inert-free when closed, and does not steal focus on load", async () => {
    VIEW = { width: 390, height: 844 };
    stub_gateway_fetch();
    const { container } = render(<App />);
    const menu = await screen.findByRole("button", { name: "Open navigation" });
    expect(container.querySelector("aside.shell_sidebar")).toBeNull();
    const drawer = nav_drawer();
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.style.display).toBe("none");
    expect(drawer.hasAttribute("inert")).toBe(true);
    expect(container.querySelector(".shell_main")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).not.toBe(menu);
  });

  it("opens with focus inside, makes the page inert, and Escape returns focus to the menu button", async () => {
    VIEW = { width: 390, height: 844 };
    stub_gateway_fetch();
    const { container } = render(<App />);
    const menu = await screen.findByRole("button", { name: "Open navigation" });
    fireEvent.click(menu);
    const drawer = nav_drawer();
    await waitFor(() => expect(drawer.getAttribute("aria-hidden")).toBeNull());
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    expect((document.activeElement as HTMLElement).classList.contains("shell_nav_item")).toBe(true);
    expect(container.querySelector(".shell_main")?.hasAttribute("inert")).toBe(true);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(drawer.getAttribute("aria-hidden")).toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open navigation" })));
    expect(container.querySelector(".shell_main")?.hasAttribute("inert")).toBe(false);
  });

  it("picking a page closes the drawer", async () => {
    VIEW = { width: 820, height: 1180 };
    stub_gateway_fetch();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Open navigation" }));
    const drawer = nav_drawer();
    fireEvent.click(drawer.querySelector<HTMLButtonElement>(".shell_nav_item[title='Settings']")!);
    await waitFor(() => expect(drawer.getAttribute("aria-hidden")).toBe("true"));
    expect(document.querySelector(".shell_header_title")?.textContent).toBe("Settings");
  });

  it("an open drawer closes and the sidebar docks when the window crosses 1024 px, and back again", async () => {
    VIEW = { width: 900, height: 900 };
    stub_gateway_fetch();
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Open navigation" }));
    await waitFor(() => expect(nav_drawer().getAttribute("aria-hidden")).toBeNull());

    resize(1300);
    await waitFor(() => expect(container.querySelector("aside.shell_sidebar")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull();
    expect(query_nav_drawer()).toBeNull();

    resize(900);
    await waitFor(() => expect(container.querySelector("aside.shell_sidebar")).toBeNull());
    const menu = screen.getByRole("button", { name: "Open navigation" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(nav_drawer().getAttribute("aria-hidden")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
function stub_hub(): void {
  const now = Date.now() / 1000;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.includes("api/hub/meta")) return ok({ ok: true, hub_url: "http://hub", seat: "laurent", seat_key_present: true });
      if (url.includes("api/hub/healthz")) return ok({ ok: true, version: "0.10.0", protocol: "agora/0.4", paused: false });
      if (url.includes("api/hub/inbox")) return ok([]);
      if (url.includes("api/hub/owed")) return ok({ to_answer: [], to_consume: [], waiting_on: [], counts: { to_answer: 0, to_consume: 0 } });
      if (url.includes("/digest")) return ok({ counts: { open_questions: 0 } });
      if (url.includes("/info")) return ok({ channel: { name: "commons", private: false }, meta: {}, members: ["a"], state: "open", charter: null });
      if (url.includes("/members")) return ok([]);
      if (url.includes("/messages") && String(init?.method || "GET") === "GET") {
        return ok([{ id: "01A", seq: 1, channel: "commons", kind: "message", urgency: "inbox", sender: "a", status: "fyi", body: "hello thread", created_at: now, data: null, reply_to: null, read: true }]);
      }
      if (url.endsWith("api/hub/channels")) return ok([{ name: "commons", private: false, member: true, member_count: 3, last_seq: 1, last_at: now }]);
      return ok({ ok: true });
    })
  );
}

describe("Team single pane (phones)", () => {
  it("starts on the channel list, a channel opens the thread, ← Channels goes back, More toggles the thread tools", async () => {
    VIEW = { width: 375, height: 667 };
    stub_hub();
    const { container } = render(<TeamPage gateway={{ backlog_advisor: vi.fn() } as any} gateway_connected={true} />);
    const layout = () => container.querySelector(".team_layout") as HTMLElement;
    await screen.findByText("hello thread");
    expect(layout().classList.contains("team_mobile_channels")).toBe(true);
    expect(layout().classList.contains("team_mobile_thread")).toBe(false);

    const channel = container.querySelector(".team_channels_pane .team_channel") as HTMLElement;
    fireEvent.click(channel);
    expect(layout().classList.contains("team_mobile_thread")).toBe(true);

    const more = screen.getByRole("button", { name: /Show thread tools/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(layout().classList.contains("team_tools_open")).toBe(true);
    expect(screen.getByRole("button", { name: /Hide thread tools/ }).getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Back to channels" }));
    expect(layout().classList.contains("team_mobile_channels")).toBe(true);
    // Back also folds the tools away.
    expect(layout().classList.contains("team_tools_open")).toBe(false);
  });

  it("the Send button keeps its accessible name while showing an icon", async () => {
    stub_hub();
    render(<TeamPage gateway={{ backlog_advisor: vi.fn() } as any} gateway_connected={true} />);
    await screen.findByText("hello thread");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send.querySelector(".team_send_icon svg")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
function drawer_gateway() {
  return {
    backlog_exec_requests: vi.fn(async () => ({ ok: true, requests: [] })),
    backlog_content: vi.fn(async (kind: string, filename: string) => ({ kind, filename, content: "# Spec\n\n## Summary\nBody." })),
    backlog_update: vi.fn(async () => ({ ok: true, sha256: "x" })),
  } as any;
}

function render_drawer(on_close: () => void) {
  return render(
    <WorkItemDrawer
      gateway={drawer_gateway()}
      can_use_gateway={true}
      target={{ filename: "0001-x.md", kind: "planned", title: "Thing" }}
      on_close={on_close}
      on_mutated={async () => {}}
      on_open_executions={() => {}}
    />
  );
}

describe("work-item drawer Escape guard", () => {
  it("Escape inside the spec editor neither closes the drawer nor discards the edit", async () => {
    const on_close = vi.fn();
    const { container } = render_drawer(on_close);
    await screen.findByText("Body.");
    fireEvent.click(screen.getByRole("button", { name: "Edit spec" }));
    const editor = container.querySelector("textarea.work_spec_editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Spec\n\nUNSAVED-EDIT" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(on_close).not.toHaveBeenCalled();
    // Escape elsewhere while an edit is open: still kept.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(on_close).not.toHaveBeenCalled();
    expect((container.querySelector("textarea.work_spec_editor") as HTMLTextAreaElement).value).toContain("UNSAVED-EDIT");
  });

  it("Escape with no edit open closes the drawer", async () => {
    const on_close = vi.fn();
    render_drawer(on_close);
    await screen.findByText("Body.");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("Escape does not close the drawer under an open modal, nor when another layer consumed it", async () => {
    const on_close = vi.fn();
    render_drawer(on_close);
    await screen.findByText("Body.");
    const backdrop = document.createElement("div");
    backdrop.className = "modal_backdrop";
    document.body.appendChild(backdrop);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(on_close).not.toHaveBeenCalled();
    backdrop.remove();

    const consumed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    consumed.preventDefault();
    document.body.dispatchEvent(consumed);
    expect(on_close).not.toHaveBeenCalled();
  });

  it("escape_targets_editable recognises fields", () => {
    const ta = document.createElement("textarea");
    const div = document.createElement("div");
    expect(escape_targets_editable(ta)).toBe(true);
    expect(escape_targets_editable(div)).toBe(false);
    expect(escape_targets_editable(null)).toBe(false);
  });

  it("the modal consumes Escape (preventDefault) so the layer below stays open", () => {
    const on_close = vi.fn();
    render(
      <Modal open={true} title="Dialog" onClose={on_close}>
        body
      </Modal>
    );
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(on_close).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("responsive stylesheet rules the states depend on", () => {
  const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");
  // Team's single-pane stack and collapsed chrome: below 1024 px (phones and
  // tablets — a ~200 px channel list beside the thread fails DESIGN §12's
  // "two columns only when both get ~360 px").
  const STACK = /@media \(max-width: 1023\.98px\) \{/g;

  function blocks(re: RegExp): string[] {
    const out: string[] = [];
    for (const m of css.matchAll(re)) {
      let depth = 0;
      let i = (m.index ?? 0) + m[0].length - 1;
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      out.push(css.slice(start, i + 1));
    }
    return out;
  }

  it("the single-pane stack hides the thread on the channel list and the channels on the thread", () => {
    const stack = blocks(STACK).join("\n");
    expect(stack).toMatch(/\.team_layout\.team_mobile_channels > \.team_thread_pane,[\s\S]*?\.team_layout\.team_mobile_thread > \.team_channels_pane[\s\S]*?\{\s*display: none;/);
    expect(stack).toMatch(/\.team_layout > \.pane \{\s*grid-row: 2;/);
  });

  it("the collapsed thread chrome hides the filter bar and panel tabs until More is open", () => {
    const stack = blocks(STACK).join("\n");
    expect(stack).toMatch(/\.team_layout\.team_mobile_thread:not\(\.team_tools_open\) \.team_filterbar,[\s\S]*?\{\s*display: none;/);
    expect(stack).toMatch(/\.team_send_label \{[^}]*clip-path: inset\(50%\)/);
  });

  it("the docked sidebar is hidden below 1024 px", () => {
    expect(css).toMatch(/@media \(max-width: 1023\.98px\) \{\s*\.shell > \.shell_sidebar \{\s*display: none;/);
  });

  it("reading surfaces use the body size on touch and the kit small tokens are NOT overridden", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.team_row_body,\s*\.inbox_markdown,\s*\.md_doc,[\s\S]*?font-size: var\(--font-size-body\)/);
    expect(css).not.toMatch(/--font-size-(xxs|xs|sm|md):\s*max\(/);
  });
});
