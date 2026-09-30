// Phone-space capture screens for AbstractContinuum (DESIGN §12: list + detail screens use the
// full width on phones). Same harness and fixture as scripts/responsive.screens.mjs (whose setup,
// sign-in and hub mock this module reuses), plus a browser-side mock of the gateway's backlog
// execution endpoints so the Executions detail, its QA decision (verdict) panel, the event log
// (transcript) and the work drawer's Review tab have content — the fixture has no executor.
//
//   work list (board, backlog) → work drawer (detail, spec editor, review) → executions detail
//   (facts + QA decision) → executions log (events transcript) → team (thread + members pane)
//   → thread → inbox (report detail)
//
//   [SPACE_THEME=light] node harness/capture.mjs --app continuum --url http://127.0.0.1:18788 --screens scripts/space.screens.mjs --out <dir> --viewports iphone-15pro,ipad,mbp-14
//
// Read the space columns (text% / scroll / pad) of summary.md on the phone rows.

import base from "./responsive.screens.mjs";

const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const FILE = "003-abstractgateway-data-and-caches-writer-wave-plus-console-and-cli-ruled-plan-phases-1-2.md";
const REQ = {
  request_id: "req_7f3c2a9e41d84b1c9a55",
  status: "awaiting_qa",
  created_at: iso(3_600_000),
  started_at: iso(3_540_000),
  finished_at: iso(600_000),
  backlog_relpath: `docs/backlog/planned/${FILE}`,
  backlog_kind: "planned",
  backlog_filename: FILE,
  target_agent: "codex",
  target_model: "gpt-5-codex",
  target_reasoning_effort: "high",
  executor_type: "codex",
  ok: true,
  exit_code: 0,
  run_dir_relpath: "runtime/backlog_exec/runs/req_7f3c2a9e41d84b1c9a55",
  last_message: "Registered every gateway-owned data home at boot and added GET /admin/data-homes with a dry-run-first purge; tests green.",
};
const DETAIL = {
  ...REQ,
  execution_mode: "uat",
  attempt: 1,
  uat_lock_acquired: true,
  candidate_relpath: "runtime/backlog_exec/candidates/req_7f3c2a9e41d84b1c9a55/abstractgateway",
  candidate_patch_relpath: "runtime/backlog_exec/candidates/req_7f3c2a9e41d84b1c9a55/candidate.patch",
  candidate_manifest_relpath: "runtime/backlog_exec/candidates/req_7f3c2a9e41d84b1c9a55/manifest.json",
  uat_current_relpath: "runtime/uat/current/abstractgateway",
};
const EVENTS = [
  { type: "thread.started", thread_id: "thr_01" },
  { type: "item.completed", item: { id: "i1", type: "agent_message", text: "I read the backlog item and the core ensure-lane. The gateway registers its data homes nowhere today, so the console cannot show or purge them. Plan: register the homes at boot, add the admin endpoint, then the CLI." } },
  { type: "item.completed", item: { id: "i2", type: "command_execution", command: "/bin/zsh -lc 'python -m pytest tests/test_data_homes.py -q'", status: "completed", exit_code: 0, aggregated_output: "........                                                     [100%]\n8 passed in 1.92s" } },
  { type: "item.completed", item: { id: "i3", type: "agent_message", text: "Registered runs, ledgers, artifacts, entity homes (safe_to_purge=false), logs, workspaces and dev at boot. GET /admin/data-homes lists them with sizes; purge runs a dry run first and names every folder it would delete. The CLI mirrors it as `abstractgateway data list` and `abstractgateway data purge --dry-run`." } },
  { type: "turn.completed", usage: { input_tokens: 48213, output_tokens: 3920 } },
];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockExec(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  if (p.endsWith("/api/gateway/admin/executors")) return json(route, { executors: [{ id: "codex", display: "Codex", available: true }] });
  if (p.endsWith("/backlog/exec/config")) return json(route, { ok: true, runner_enabled: true, runner_alive: true, can_execute: true, executor: "codex" });
  if (p.includes("/logs/tail")) {
    const content = EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n";
    return json(route, { ok: true, request_id: REQ.request_id, name: url.searchParams.get("name") || "events", bytes: content.length, truncated: false, content, next_offset: content.length });
  }
  if (p.match(/\/backlog\/exec\/requests\/[^/]+$/)) return json(route, { ok: true, request_id: REQ.request_id, payload: DETAIL });
  if (p.endsWith("/backlog/exec/requests")) {
    const status = String(url.searchParams.get("status") || "");
    return json(route, { ok: true, requests: status.includes("awaiting_qa") || !status ? [REQ] : [] });
  }
  return route.continue();
}

const byName = Object.fromEntries(base.screens.map((s) => [s.name, s]));

async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(60);
  }
}

async function openDrawer(page) {
  await byName.board.run(page);
  await page.locator(".board_card", { hasText: /Data and Caches/i }).first().click();
  await page.locator(".work_drawer_body").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
}

async function openExec(page) {
  await byName.executions.run(page);
  const card = page.locator(".run_card").first();
  // 0.5.0 phones showed one pane at a time: return to the list first.
  const back = page.locator(".inbox_detail_actions").getByRole("button", { name: "Back", exact: true });
  if (!(await card.isVisible().catch(() => false)) && (await back.isVisible().catch(() => false))) await back.click();
  await card.waitFor({ timeout: 15000 });
  await card.click();
  await page.locator(".inbox_detail .fact_grid").first().waitFor({ timeout: 15000 });
}

export default {
  async setup(page, info) {
    // SPACE_THEME=light|dark picks the app's own theme (Continuum follows its
    // Appearance setting, not prefers-color-scheme).
    const theme = process.env.SPACE_THEME;
    if (theme) {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("af_appearance_continuum_v1", JSON.stringify({ theme: t }));
        } catch {}
      }, theme);
    }
    await base.setup(page, info);
    // Registered after the base catch-all, so Playwright consults it first.
    await page.route(/\/api\/gateway\/(backlog\/exec|admin\/executors)/, mockExec);
  },
  screens: [
    { name: "board", run: byName.board.run, settle: 900 },
    { name: "backlog", run: byName.backlog.run, settle: 800 },
    {
    name: "detail",
    async run(page) {
      await openDrawer(page);
      await page.locator(".work_drawer_tabs .tab", { hasText: "Spec" }).click();
      await page.locator(".work_drawer_body .md_doc").first().waitFor({ timeout: 10000 });
    },
    settle: 900,
  },
    {
      name: "spec-editor",
      async run(page) {
        await openDrawer(page);
        await page.locator(".work_drawer_tabs .tab", { hasText: "Spec" }).click();
        await page.getByRole("button", { name: "Edit spec" }).click();
        await page.locator(".work_spec_editor").waitFor({ timeout: 10000 });
      },
      settle: 700,
    },
    {
      name: "review",
      async run(page) {
        await openDrawer(page);
        await page.locator(".work_drawer_tabs .tab", { hasText: "Review" }).click();
        await page.getByText("Definition of Done", { exact: false }).first().waitFor({ timeout: 10000 });
      },
      settle: 700,
    },
    {
      name: "exec-detail",
      async run(page) {
        await closeOverlays(page);
        await openExec(page);
        await page.getByText("QA decision").first().scrollIntoViewIfNeeded().catch(() => {});
      },
      settle: 900,
    },
    {
      name: "exec-log",
      async run(page) {
        await closeOverlays(page);
        await openExec(page);
        const ev = page.locator(".exec_event", { hasText: "agent_message" }).last();
        await ev.waitFor({ state: "attached", timeout: 15000 });
        // Open the entry in place (a click can land on a neighbour while the
        // live log re-renders) and bring it to the top of its scroller.
        await ev.evaluate((el) => {
          el.open = true;
          el.scrollIntoView({ block: "start" });
        });
      },
      settle: 900,
    },
    { name: "team", run: byName.team.run, settle: 900 },
    { name: "thread", run: byName.thread.run, settle: 900 },
    { name: "inbox", run: byName.inbox.run, settle: 900 },
  ],
  sweepScreen: "detail",
};
