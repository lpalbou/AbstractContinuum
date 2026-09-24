# Architecture

AbstractContinuum is a thin browser client over the Run Gateway's
development-lane APIs. It holds no durable state of its own: the gateway
owns the backlog files, exec requests, reports, email access, and managed
processes; the app renders them and issues commands.

## System shape

```mermaid
flowchart LR
    subgraph Browser["Browser (React SPA — sidebar shell)"]
        BO[Board page<br/>kanban + drawer]
        EX[Executions page]
        BL[Backlog page]
        AG[Agents page]
        TM[Team page<br/>agora hub client]
        HC[HubClient<br/>src/lib/hub_client.ts]
        IN[Inbox page]
        PR[Services page]
        SE[Settings page<br/>uic sign-in card]
        GC[GatewayClient<br/>src/lib/gateway_client.ts]
        BO --> GC
        EX --> GC
        BL --> GC
        AG --> GC
        IN --> GC
        PR --> GC
        TM --> HC
    end

    subgraph AppServer["bin/cli.js (node)"]
        SP[Gateway session proxy<br/>@abstractframework/app-server]
        ST[Static dist/ serving]
        HP[Hub proxy<br/>bin/hub_proxy.js<br/>seat key server-side]
    end

    subgraph Hub["agora hub (optional)"]
        HA["channels, DMs, search,<br/>files, work, desk"]
    end

    subgraph Gateway["Run Gateway (abstractgateway)"]
        BK["/backlog/* (CRUD + template)"]
        EP["/backlog/exec/* (requests, logs, QA)"]
        RP["/reports/*, /triage/*, /email/*"]
        PM["/processes/* (start/stop/redeploy, env)"]
        SH["/runs, /attachments, /audio, /voice (shared reads)"]
        WK[Exec worker<br/>executor: codex_cli today]
    end

    GC -- "/api/* + session cookies + CSRF" --> SP
    SE -- "POST /api/connection/gateway" --> SP
    SP -- "x-abstractgateway-session" --> BK & EP & RP & PM & SH
    HC -- "/api/hub/* + /api/hub/ws" --> HP
    HP -- "allowlisted routes + Bearer seat key" --> HA
    EP --- WK
    WK -- "candidate workspace → UAT → promote" --> Repos[(Framework repos<br/>prod + UAT trees)]
```

One transport mode: same-origin. The browser talks only to the app
server (`bin/cli.js` in production, the equivalent vite plugin in dev).
The session proxy signs in against the gateway, holds the session
server-side, sets first-party cookies, and enforces CSRF on mutating
requests. Tokens never reach browser storage. The Team page uses the same
origin: `/api/hub/*` and the `/api/hub/ws` WebSocket are served by the hub
proxy, which attaches the operator seat's key server-side.

## The execution pipeline

The heart of the app is the exec pipeline. One request moves through:

```mermaid
stateDiagram-v2
    [*] --> queued: execute (item or batch)
    queued --> running: worker picks up
    running --> awaiting_qa: success (BOTH modes — human decision required)
    running --> failed: error / non-zero exit
    awaiting_qa --> running: Iterate (send feedback)
    awaiting_qa --> promoted: Approve (UAT — promote to prod;<br/>inplace — finalize: prod already mutated)
    awaiting_qa --> awaiting_qa: Restart UAT (deploy candidate)
    promoted --> [*]
    failed --> [*]
```

Success always parks at `awaiting_qa` — inplace mode does NOT bypass the
human decision; its Approve merely finalizes a request whose changes are
already in prod (the QA panel says so explicitly). A `completed` status
survives in the filters for legacy requests but no current gateway path
produces it.

The **Executions page** (landing) pins `use_exec_pipeline` to the live
view: it polls active requests (2s), follows the selected request's log
tail (1.5s while running), and exposes the QA actions directly. The
**Backlog page** drives the same hook from its Processing / Failed /
Completed-runs tabs.

### Executor agnosticism

The executing agent is a deliberate seam, not a hardcoded dependency. The
gateway's `/backlog/exec/config` names the executor (`executor`,
`codex_bin`, `codex_model`, availability), and the UI renders whatever it
reports. Today that is the Codex CLI running headless; the design intent is
that other agents (for example `abstractcode`) can power the same pipeline
without UI changes beyond what the config reports. Keep new UI copy
executor-neutral and read identity from the config.

## Module layout

```text
src/
  app.tsx                     shell: sidebar nav, uic connect modal, probe
  lib/
    gateway_client.ts         typed gateway client (dev-lane families only)
    gateway_types.ts          request/response types
    hub_client.ts             agora hub client (via the /api/hub proxy)
    hub_api_types.ts          types generated from vendor/hub/openapi.json
    hub_contract.ts           compile-time pins against the hub contract
    hub_ledger.ts             independent hub ledger verification
    team_model.ts             Team page pure model (threads, filters, badges)
    work_id.ts                work-item id + rendered-state derivations
    entity_skills_model.ts    entity skills view model
    voice_settings.ts         per-browser voice overrides
    markdown_segments.ts      prose / mermaid splitting for rendering
    session_run_id.ts, ids.ts small id helpers
  ui/
    board/
      board_model.ts          metadata convention + DoR + column derivation (pure, pinned)
      use_board_data.ts       list/request fetches + lazy metadata cache
      use_work_claims.ts      hub work-claim rows joined onto board cards
      board_page.tsx          kanban columns/cards/filters + execute gate
      work_item_drawer.tsx    Spec / Runs / Review tabs
      work_activity_panel.tsx hub work activity for hub-backed cards
    backlog/
      model.ts                pure helpers (unit-pinned)
      hooks.ts                small shared hooks (media query, executor registry)
      use_exec_pipeline.ts    exec pipeline state + polling
      backlog_page.tsx        catalog table + composition root
      exec_detail_pane.tsx    exec detail + QA panel
      exec_events_view.tsx    live log/events viewer
      execute_modals.tsx      execute / batch / merge confirms
      new_task_modal.tsx      creation flow (template, guided, assist)
      advisor_drawer.tsx      read-only backlog advisor (chat + voice)
    team_page.tsx             Team page (agora hub client)
    team_file_viewer.tsx      channel file viewer
    agents_page.tsx           executor roster, entities, track record
    entity_skills_panel.tsx   entity skills section
    executions_page.tsx       live pipeline ops view
    report_inbox.tsx          bug/feature reports + triage decisions
    email_inbox.tsx           email accounts/messages/send
    processes_page.tsx        managed process control + env vars (Services)
    settings_page.tsx         connection status + AI and voice preferences
    voice_settings_panel.tsx  voice override controls
    exec_event.ts             exec-log event classification
    backlog_folder.tsx        backlog folder state panel (empty / not available + admin actions)
    memo_markdown.tsx, mermaid_block.tsx   markdown + mermaid rendering
    modal.tsx, multi_select.tsx, error_boundary.tsx   shared widgets
bin/cli.js                    static serve + session proxy + hub proxy mount
bin/hub_proxy.js              allowlisted agora hub proxy (HTTP + WebSocket)
vendor/hub/                   vendored hub OpenAPI + golden conformance vectors
```

### The Board model

Columns derive from gateway state — no board-side storage:
Triage = proposed files, Ready = planned files not inside a live request,
In Progress / In Review = live exec requests (the busy set comes from the
gateway's batch-aware `active_items` expansion — the same source the
Backlog page uses), Done / Failed = recent terminal requests (attempts;
the completed-file archive lives on the Backlog page). Work-item metadata
(priority, labels — sprints are `sprint-N` labels) rides convention lines
in the spec markdown header (`> Priority: P1`, `> Labels: ui, sprint-29`),
parsed client-side until the gateway serves list-level metadata (ask on
file). The Definition-of-Ready gate is advisory client-side (override
always available); the server-side gate is a filed gateway ask.

Design boundaries:

- **Purpose boundary** — the observer observes and discusses; continuum
  develops and deploys. Observation features do not grow here.
- **Concern boundary** — `model.ts`, `board_model.ts` and `team_model.ts`
  are pure (no React/network) and unit-pinned; hooks such as
  `use_exec_pipeline` each own one concern; panes are presentational.
- **Client boundary** — `gateway_client.ts` carries only the API families
  this app uses (see [api.md](api.md)); new observation-lane methods belong
  in the observer.

## Related

- [api.md](api.md) — the exact endpoint families consumed
- [configuration.md](configuration.md) — env vars, settings, proxy knobs
- [security.md](security.md) — trust model (process manager is high trust)
- `docs/backlog/overview.md` — work planning and history
- `history.md` (repo root) — provenance of the 2026-07-12 split
- `vendor/hub/` — the hub contract the Team page is typed and tested against
