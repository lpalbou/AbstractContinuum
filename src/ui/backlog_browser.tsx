// Public entry for the Backlog page.
//
// History: the 4,141-line observer-era monolith was split on 2026-07-12,
// then the page was REDESIGNED on 2026-07-13 as the file-archive table
// (kind segments + data table + the board's WorkItemDrawer); the live
// execution views moved to the Executions page. Current modules under
// ./backlog/: model.ts (pure helpers), use_exec_pipeline (exec state +
// polling, shared with Executions), execute_modals / new_task_modal /
// advisor_drawer / exec_detail_pane / exec_events_view, and
// backlog_page.tsx as the composition root.
export { BacklogBrowserPage, type BacklogBrowserPageProps } from "./backlog/backlog_page";
