// Responsive capture screens for AbstractContinuum (harness: untracked/responsive/harness/capture.mjs).
//
// Drives every main surface against the isolated fixture gateway (abstractcode/web/e2e/gateway_fixture.py,
// no model) seeded with a scratch backlog + report inbox. The Team page's agora hub is MOCKED in the
// browser (page.route on api/hub/*, shapes from src/ui/team_page.test.tsx): no hub process, no seat key.
//
//   connect → board (kanban) → detail (work item drawer) → backlog (table) → execute (execution form)
//   → executions → team (channels | thread | inspector drawer) → diagram (hub file with mermaid)
//   → inbox (bug report open) → processes → agents → settings → new-task (dialog) → about (dialog)
//
//   node harness/capture.mjs --app continuum --url http://127.0.0.1:18788 --screens scripts/responsive.screens.mjs --out <dir> --sweep
//
// Env overrides: CONTINUUM_E2E_GATEWAY_URL / _USER / _TOKEN (fixture defaults below).

const GATEWAY = process.env.CONTINUUM_E2E_GATEWAY_URL || "http://127.0.0.1:18787";
const USER = process.env.CONTINUUM_E2E_USER || "web-tester";
const TOKEN = process.env.CONTINUUM_E2E_TOKEN || "abstractcode-e2e-only";

const NOW = Math.floor(Date.now() / 1000);
const CHANNELS = [
  { name: "commons", private: false, member: true, member_count: 14, last_seq: 12, last_at: NOW - 60 },
  { name: "release-wave", private: false, member: true, member_count: 6, last_seq: 40, last_at: NOW - 600 },
  { name: "responsive-design", private: true, member: true, member_count: 8, last_seq: 7, last_at: NOW - 3600 },
];
const BASE_MSG = { channel: "commons", kind: "message", urgency: "inbox", data: null, reply_to: null, read: true };
const MESSAGES = [
  { ...BASE_MSG, id: "01ROOT", seq: 1, sender: "framework", status: "open", title: "Release sequence for the responsive wave", body: "Kit 0.3.0 first, then the apps in parallel: Code, Flow, Observer, Continuum, Entity. Every app vendors the kit tarball and proves it in node_modules and in the built dist before its after-capture.", created_at: NOW - 7200 },
  { ...BASE_MSG, id: "01R1", seq: 2, sender: "kit", status: "reply", reply_to: "01ROOT", body: "Packs are building. Breakpoints are 480/768/1024/1440 plus max-height 500 for phone landscape. The drawer gains a left-edge modifier.", created_at: NOW - 7000 },
  { ...BASE_MSG, id: "01R2", seq: 3, sender: "continuum", status: "reply", reply_to: "01ROOT", body: "Continuum shares the Observer root CSS; the Team page is the three-pane (channels | thread | inspector). Plan: two panes below 1440, one pane with a back button below 768.", created_at: NOW - 6800 },
  { ...BASE_MSG, id: "01Q", seq: 4, sender: "observer", status: "open", kind: "ask", title: "Does the rail stay visible on phones?", body: "The vertical drawer tabs (Assistant / Members / Files / Leaderboard / Desk) take 30px on the right edge. On a 375px phone that is 8% of the width.", created_at: NOW - 3000 },
  { ...BASE_MSG, id: "01F", seq: 5, sender: "flow", status: "fyi", body: "FYI: a long unbroken identifier like abstractframework-ui-kit-0.3.0.tgz/sha256:9f2c8e1d0b7a6f5e4d3c2b1a09f8e7d6c5b4a3928170f6e5d4c3b2a1908f7e6d must wrap instead of widening the thread.", created_at: NOW - 1200 },
  { ...BASE_MSG, id: "01G", seq: 6, sender: "entity", status: "fyi", body: "Blueprint SVG goes into an overflow-x wrapper. Nothing else to report.", created_at: NOW - 300 },
];
const MERMAID_PLAN = [
  "# Responsive plan",
  "",
  "Three-pane layout by width:",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Channels] --> B[Thread]",
  "  B --> C[Inspector]",
  "  B -->|below 768| D[Back button]",
  "```",
  "",
  "| Width | Panes |",
  "|---|---|",
  "| >= 1440 | channels, thread, inspector |",
  "| 1024-1439 | channels, thread; inspector drawer |",
  "| < 768 | one pane at a time |",
].join("\n");

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** The Team page's agora hub, mocked in the browser (never a real hub). */
async function mockHub(route) {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  if (url.includes("api/hub/meta")) return json(route, { ok: true, hub_url: "http://hub.invalid", seat: "operator", seat_key_present: true });
  if (url.includes("api/hub/healthz")) return json(route, { ok: true, version: "0.12.50", protocol: "agora/0.4", paused: false });
  if (url.includes("api/hub/inbox")) return json(route, []);
  if (url.includes("api/hub/owed")) return json(route, { to_answer: [], to_consume: [], waiting_on: [], counts: { to_answer: 0, to_consume: 0 } });
  if (url.includes("api/hub/desk")) return json(route, { rows: [], satisfied: [] });
  if (url.includes("api/hub/presence")) return json(route, []);
  if (url.includes("api/hub/search")) {
    const empty = { hits: [], shown: 0, total: 0 };
    return json(route, { decisions: empty, open_threads: empty, work: empty, people: empty, files: empty, messages: empty, relaxed: false, channels_searched: 0, next_cursor: null, computed_at: 1 });
  }
  if (url.includes("/digest")) return json(route, { counts: { open_questions: 1 } });
  if (url.includes("/info")) {
    return json(route, { channel: { name: "commons", private: false }, meta: { purpose: "cross-package commons" }, members: ["framework", "kit", "continuum", "observer", "flow", "entity"], response_sla_minutes: 1440, state: "open", charter: null });
  }
  if (url.includes("/members")) {
    return json(route, ["framework", "kit", "continuum", "observer", "flow", "entity"].map((id) => ({ agent_id: id, role: id === "framework" ? "owner" : "member", joined_at: NOW - 86400 })));
  }
  if (url.match(/api\/hub\/channels\/[^/]+\/messages/) && method === "GET") return json(route, MESSAGES);
  if (url.match(/api\/hub\/channels\/[^/]+\/fs(\?|$)/)) {
    return json(route, [{ path: "plans/responsive.md", version: 2, updated_by: "continuum", updated_at: NOW - 900, size: MERMAID_PLAN.length, description: "responsive plan with a diagram" }]);
  }
  if (url.match(/api\/hub\/channels\/[^/]+\/fs\//)) {
    return json(route, { path: "plans/responsive.md", content: MERMAID_PLAN, mime: "text/markdown", version: 2, updated_by: "continuum", updated_at: NOW - 900 });
  }
  if (url.endsWith("api/hub/channels")) return json(route, CHANNELS);
  if (url.includes("api/hub/agents/retired") || url.includes("api/hub/blocks") || url.includes("api/hub/delegations")) return json(route, []);
  if (url.includes("/store")) return json(route, {}, 404);
  if (url.includes("/work")) return json(route, []);
  if (url.includes("api/hub/reputation")) return json(route, { agents: [], computed_at: 1 });
  if (url.includes("api/hub/ws")) return route.abort("blockedbyclient");
  return json(route, { ok: true });
}

async function installRoutes(page, baseUrl) {
  const allowed = new URL(baseUrl).origin;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== allowed) return route.abort("blockedbyclient");
    if (url.pathname.includes("/api/hub/")) return mockHub(route);
    return route.continue();
  });
}

async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(60);
  }
  // App drawers/modals: their own Close button (the baseline work drawer ignores Escape).
  for (let i = 0; i < 3; i++) {
    const close = page.locator(".drawer_backdrop .drawer_header, .modal_backdrop .modal_header, .modal_backdrop .modal_head").getByRole("button", { name: "Close", exact: true }).first();
    if (!(await close.isVisible().catch(() => false))) break;
    await close.click().catch(() => {});
    await page.waitForTimeout(120);
  }
}

const connectDialog = (page) => page.getByRole("dialog", { name: "Gateway connection" });

async function signedIn(page) {
  return (await page.locator(".shell_banner", { hasText: "Gateway unreachable" }).count()) === 0 && !(await connectDialog(page).isVisible().catch(() => false));
}

async function signIn(page) {
  const dialog = connectDialog(page);
  if (!(await dialog.isVisible().catch(() => false))) {
    if (await signedIn(page)) return;
    await dialog.waitFor({ state: "visible", timeout: 15000 });
  }
  await page.locator("#gateway-session-url").fill(GATEWAY);
  await page.locator("#gateway-session-user").fill(USER);
  await page.locator("#gateway-session-token").fill(TOKEN);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });
  await page.locator(".shell_banner", { hasText: "Gateway unreachable" }).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
}

/** Navigate by the sidebar (or the drawer menu when the sidebar is a drawer). */
async function go(page, label) {
  await closeOverlays(page);
  const item = page.locator(".shell_nav_item", { hasText: label }).first();
  if (!(await item.isVisible().catch(() => false))) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible().catch(() => false)) await menu.click();
  }
  await item.click();
  await page.waitForTimeout(400);
}

export default {
  async setup(page, info) {
    await installRoutes(page, info.baseUrl);
    await page.goto(info.baseUrl + "/");
    await connectDialog(page).waitFor({ state: "visible", timeout: 20000 });
  },
  screens: [
    {
      name: "connect",
      async run(page) {
        const dialog = connectDialog(page);
        await dialog.waitFor({ state: "visible", timeout: 15000 });
        await page.locator("#gateway-session-url").fill(GATEWAY);
        await page.locator("#gateway-session-user").fill(USER);
      },
    },
    {
      name: "board",
      async run(page) {
        await signIn(page);
        await go(page, "Board");
        await page.locator(".board_card").first().waitFor({ timeout: 15000 });
      },
      settle: 900,
    },
    {
      name: "detail",
      async run(page) {
        await go(page, "Board");
        await page.locator(".board_card").first().waitFor({ timeout: 15000 });
        await page.locator(".board_card", { hasText: /thin client|Gateway/i }).first().click();
        await page.locator(".work_drawer_body").waitFor({ timeout: 15000 });
      },
      settle: 900,
    },
    {
      name: "backlog",
      async run(page) {
        await go(page, "Backlog");
        await page.getByRole("button", { name: "Execute" }).first().waitFor({ timeout: 15000 });
      },
      settle: 800,
    },
    {
      name: "execute",
      async run(page) {
        await go(page, "Backlog");
        await page.getByRole("button", { name: "Execute" }).first().click();
        await page.getByRole("dialog").first().waitFor({ timeout: 10000 }).catch(() => {});
      },
      settle: 700,
    },
    {
      name: "executions",
      async run(page) {
        await go(page, "Executions");
      },
      settle: 800,
    },
    {
      name: "team",
      async run(page) {
        await go(page, "Team");
        const ch = page.locator(".team_channels_pane", { hasText: "commons" }).getByText("commons", { exact: false }).first();
        if (await ch.isVisible().catch(() => false)) await ch.click().catch(() => {});
        else await page.getByText("commons", { exact: false }).first().click().catch(() => {});
        await page.getByText("Release sequence for the responsive wave").first().waitFor({ state: "attached", timeout: 15000 });
        const members = page.getByRole("button", { name: "Open channel members drawer" });
        if ((await members.getAttribute("aria-pressed").catch(() => null)) !== "true") await members.click({ timeout: 5000 }).catch(() => {});
      },
      settle: 900,
    },
    {
      name: "diagram",
      async run(page) {
        await go(page, "Team");
        await page.getByText("Release sequence for the responsive wave").first().waitFor({ state: "attached", timeout: 15000 });
        const files = page.getByRole("button", { name: "Open channel files drawer" });
        if ((await files.getAttribute("aria-pressed").catch(() => null)) !== "true") await files.click({ timeout: 5000 }).catch(() => {});
        const file = page.getByText("responsive.md").first();
        if (!(await file.isVisible().catch(() => false))) await page.getByText("plans", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
        await file.click({ timeout: 5000 }).catch(() => {});
        await page.locator("svg[id^='mermaid'], .mermaid svg, [class*=mermaid] svg").first().waitFor({ timeout: 15000 }).catch(() => {});
      },
      settle: 1200,
    },
    {
      name: "inbox",
      async run(page) {
        await go(page, "Inbox");
        await page.getByRole("button", { name: "Bugs", exact: true }).first().click().catch(() => {});
        await page.getByText("Board columns overflow on a phone").first().click({ timeout: 10000 }).catch(() => {});
      },
      settle: 900,
    },
    {
      name: "processes",
      async run(page) {
        await go(page, "Services");
      },
      settle: 700,
    },
    {
      name: "agents",
      async run(page) {
        await go(page, "Agents");
      },
      settle: 700,
    },
    {
      name: "settings",
      async run(page) {
        await go(page, "Settings");
      },
      settle: 700,
    },
    {
      name: "new-task",
      async run(page) {
        await go(page, "Board");
        await page.getByRole("button", { name: "+ New task" }).first().click();
        await page.getByRole("dialog").first().waitFor({ timeout: 10000 }).catch(() => {});
      },
      settle: 700,
    },
    {
      name: "about",
      async run(page) {
        await closeOverlays(page);
        await page.getByRole("button", { name: /^About/ }).first().click();
        await page.getByRole("dialog").first().waitFor({ timeout: 10000 }).catch(() => {});
      },
      settle: 700,
    },
  ],
  sweepScreen: "team",
};
