import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AbstractContinuum styles", () => {
  it("uses shared typography tokens for base sizing", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/font-size:\s*var\(--font-size-base\)/);
    expect(css).toMatch(/line-height:\s*var\(--line-height-base\)/);
    expect(css).toMatch(/\.btn\s*\{[^}]*font-size:\s*var\(--font-size-md\)/);
  });

  it("avoids fixed px font sizes (respects --font-scale)", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/font-size:\s*\d+px\b/);
  });

  it("styles the shell root so pages get a bounded height (scroll containers work)", () => {
    // Adversarial find 2026-07-12: the shell root class had no rule, so
    // every page taller than the viewport was clipped with no scrollbar.
    // Pin the (redesigned) shell rules: bounded-height root, sidebar,
    // header, and content column.
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.shell\s*\{[^}]*display:\s*flex;[^}]*height:\s*100vh;/);
    expect(css).toMatch(/\.shell_main\s*\{[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/);
    expect(css).toMatch(/\.shell_content\s*\{[^}]*min-height:\s*0;/);
    expect(css).toMatch(/\.shell_sidebar\s*\{/);
    // Board columns must scroll internally.
    expect(css).toMatch(/\.board_column_body\s*\{[^}]*overflow-y:\s*auto;/);
    // Detail-pane hosts must scroll too (adversarial P0 2026-07-13: .pane
    // clips, so the backlog spec/edit surface was unreachable below the fold).
    expect(css).toMatch(/\.pane\.pane_pad_body\s*\{[^}]*overflow-y:\s*auto;/);
  });

  it("includes a mobile-safe nav layout (no overlapping tabs; sidebar collapses)", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.page\.page_scroll\s*\{[^}]*overflow-x:\s*hidden;/);
    // Below md (1024px) the docked sidebar leaves the row (app.tsx renders
    // the nav in a left AfDrawer; DESIGN §5.2).
    expect(css).toMatch(/@media\s*\(max-width:\s*1023\.98px\)\s*\{\s*\.shell\s*>\s*\.shell_sidebar\s*\{\s*display:\s*none;/);
    // The shell is bounded by the visible viewport (dvh / iOS keyboard), not 100vh alone.
    expect(css).toMatch(/\.shell\s*\{[^}]*height:\s*var\(--vv-height,\s*var\(--vh-full/);
    // The connection LED died with the unified top-bar adoption (uic c1648
    // — the kit pill owns connection rendering); no .gateway_led remains.
    expect(css).not.toMatch(/\.gateway_led/);
  });

  it("includes a mobile-friendly Backlog layout (scrollable segments, edge-mounted advisor)", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    // The many-tab segment scrolls instead of wrapping (2026-07-13 pass).
    expect(css).toMatch(/\.seg\.seg_scroll\s*\{[^}]*overflow-x:\s*auto;/);
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)\s*\{[\s\S]*\.advisor_toggle\s*\{[\s\S]*top:\s*50%;/);
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)\s*\{[\s\S]*\.advisor_toggle_label\s*\{[\s\S]*writing-mode:\s*vertical-rl;/);
    expect(css).toMatch(/\.drawer_panel\s*\{[^}]*width:\s*clamp\(/);
    expect(css).toMatch(/\.pane\s+\.pc-md\s+:not\(pre\)\s*>\s*code\s*\{[^}]*overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.exec_log_scroll\s*\{[^}]*padding-bottom:\s*calc\(/);
    expect(css).toMatch(/\.exec_log_scroll\s*\{[^}]*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/\.exec_event_summary\s*\{[^}]*display:\s*flex;/);
    expect(css).toMatch(/\.chip\.backlog_path_chip\s*\{/);
    expect(css).toMatch(/\.chip_icon_btn\s*\{/);
  });

  it("ships the shared page design system (panes + toolbar + segments)", () => {
    // Aesthetics pass 2026-07-13: every tab shares the board's language.
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.pane\s*\{[^}]*background:\s*var\(--bg-secondary\);/);
    expect(css).toMatch(/\.pane_header\s*\{[^}]*border-bottom:\s*1px solid var\(--bg-tertiary\);/);
    expect(css).toMatch(/\.pane_body\s*\{[^}]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.page_toolbar\s*\{[^}]*display:\s*flex;/);
    expect(css).toMatch(/\.seg_btn\.active\s*\{/);
    expect(css).toMatch(/\.entity_card\s*\{[^}]*border-radius:\s*10px;/);
    expect(css).toMatch(/\.data_table\s+th\s*\{/);
  });
});

describe("responsive contract (DESIGN v2 breakpoints)", () => {
  it("uses only the named breakpoints 480/768/1024/1440 (+ max-height 500)", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    // Viewport queries only: @container rules use PANE widths (DESIGN §6).
    const media = [...css.matchAll(/@media[^{]*/g)].map((m) => m[0]).join("\n");
    const widths = [...media.matchAll(/\((?:max|min)-width:\s*([\d.]+)px\)/g)].map((m) => m[1]);
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(["479.98", "767.98", "1023.98", "1439.98", "1440"]).toContain(w);
    const heights = [...media.matchAll(/\((?:max|min)-height:\s*([\d.]+)px\)/g)].map((m) => m[1]);
    for (const h of heights) expect(h).toBe("500");
  });

  it("stacks the Team three-pane and the list/detail pages below 768px", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.team_layout\.team_mobile_channels\s*>\s*\.team_thread_pane/);
    expect(css).toMatch(/\.inbox_layout\.phone_list\s*>\s*\.pane:nth-child\(2\)/);
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*min-height:\s*var\(--tap-min/);
  });
});
