# API surface

AbstractContinuum exposes no API of its own. This page documents the two
surfaces that matter to integrators: the gateway API families the app
consumes, and the session endpoints the bundled server provides.

## Gateway API families consumed

All calls go through `src/lib/gateway_client.ts` (types in
`src/lib/gateway_types.ts`). Paths are relative to the gateway and reached
as `/api/gateway/...` (proxied in same-origin mode).

### Backlog CRUD

| Method | Endpoint |
| --- | --- |
| `backlog_list(kind)` | `GET /backlog/{kind}` |
| `backlog_content(kind, filename)` | `GET /backlog/{kind}/{filename}/content` |
| `backlog_status()` | `GET /backlog/status` — the backlog folder's state (`available`, `path`, `source`, `is_default`, `writable`, reason when unavailable); drives the Board's empty state and *folder not available* panel |
| `backlog_template()` | `GET /backlog/template` |
| `backlog_create(...)` | `POST /backlog/create` |
| `backlog_update(...)` | `POST /backlog/{kind}/{filename}/update` (sha-guarded) |
| `backlog_move(...)` | `POST /backlog/move` |
| `backlog_merge(...)` | `POST /backlog/merge` |
| `backlog_upload_attachment(...)` | `POST /backlog/{kind}/{filename}/attachments/upload` |

### Exec pipeline (agent executions)

| Method | Endpoint |
| --- | --- |
| `backlog_execute(...)` | `POST /backlog/{kind}/{filename}/execute?execution_mode=&target_model=&target_reasoning_effort=&dor=check&override=true` — agent override validates against the gateway model allowlist (403 rendered verbatim); `dor=check` refuses 409 `{"error":"definition_of_ready_failed","checks":[...]}` unless `override=true` (recorded as `dor_overridden`) |
| `backlog_execute_batch(...)` | `POST /backlog/execute_batch` (same `target_*`/`dor`/`override` fields in the body; DoR refusals name the failing members) |
| `backlog_exec_config()` | `GET /backlog/exec/config` |
| `backlog_exec_requests(...)` | `GET /backlog/exec/requests?status=&limit=` |
| `backlog_exec_request(id)` | `GET /backlog/exec/requests/{id}` |
| `backlog_exec_feedback(...)` | `POST /backlog/exec/requests/{id}/feedback` |
| `backlog_exec_promote(...)` | `POST /backlog/exec/requests/{id}/promote` |
| `backlog_exec_deploy_uat(...)` | `POST /backlog/exec/requests/{id}/uat/deploy` |
| `backlog_exec_log_tail(...)` | `GET /backlog/exec/requests/{id}/logs/tail?name=&max_bytes=&after_bytes=` (cursor follow: delta + `next_offset` + rotation `reset` on gateways that support it) |
| `backlog_exec_active_items(...)` | `GET /backlog/exec/active_items?status=&limit=` |

### Gateway settings (Settings → Gateway administration)

| Method | Endpoint |
| --- | --- |
| `admin_runtime_config()` | `GET /admin/runtime-config` — each setting's value and source (`flag`, `stored`, `env`, `default`) plus the gateway's label and help text |
| `admin_runtime_config_update(patch)` | `POST /admin/runtime-config` — admin only; patch any of `triage_repo_root` (a path, or `null` for the gateway's own folder), `backlog_exec_runner`, `executor`, `process_manager`; the gateway validates and its refusal is shown as is |
| `admin_executors()` | `GET /admin/executors` — the executor registry (which agents are installed) for the Executor picker and the Agents page |
| `admin_data_homes()` | `GET /admin/data-homes` — the Data and caches panel |

These are the same settings as `abstractgateway config get|set` and the
gateway console's *Backlog settings*; see
[configuration.md](configuration.md#gateway-side-features).

### AI assistance

| Method | Endpoint |
| --- | --- |
| `backlog_assist(...)` | `POST /backlog/assist` (draft a new item) |
| `backlog_maintain(...)` | `POST /backlog/maintain` (refine an existing item) |
| `backlog_advisor(...)` | `POST /backlog/advisor` (read-only agent chat) |
| `discovery_providers()` / `discovery_provider_models(p)` / `discovery_model_capabilities(m)` | `GET /discovery/providers`, `GET /discovery/providers/{p}/models`, `GET /discovery/models/capabilities?model_name=` (provider/model pickers in Settings) |
| `list_bundles()` | `GET /bundles` (advisor agent picker) |

### Reports, triage, email

| Method | Endpoint |
| --- | --- |
| `list_bug_reports()` / `list_feature_requests()` | `GET /reports/bugs` / `GET /reports/features` |
| `get_bug_report_content(f)` / `get_feature_request_content(f)` | `GET /reports/{bugs\|features}/{f}/content` |
| `bug_report_create(...)` / `feature_report_create(...)` | `POST /bugs/report` / `POST /features/report` |
| `triage_run(...)` | `POST /triage/run` |
| `list_triage_decisions(...)` | `GET /triage/decisions` |
| `apply_triage_decision(...)` | `POST /triage/decisions/{id}/apply` |
| `email_list_accounts()` | `GET /email/accounts` |
| `email_list_messages(...)` | `GET /email/messages` |
| `email_read_message(...)` | `GET /email/messages/{uid}` |
| `email_send(...)` | `POST /email/send` |

### About

| Method | Endpoint |
| --- | --- |
| `gateway_about()` | `GET /about` — public; `{ abstractframework, abstractgateway, packages }`, read when the About dialog opens |

### Managed processes (high trust — see [security.md](security.md))

| Method | Endpoint |
| --- | --- |
| `list_processes()` | `GET /processes` |
| `start_process(id)` / `stop_process(id)` / `restart_process(id)` / `redeploy_process(id)` | `POST /processes/{id}/{action}` |
| `process_log_tail(id, ...)` | `GET /processes/{id}/logs/tail?max_bytes=` |
| `list_process_env_vars()` / `update_process_env_vars(...)` | `GET`/`POST /processes/env` (write-only values) |

### Shared reads

| Method | Endpoint | Used for |
| --- | --- | --- |
| `list_runs({limit:1})` | `GET /runs` | authenticated reachability probe |
| `download_run_artifact_content(run, artifact)` | `GET /runs/{run}/artifacts/{id}/content` | full exec logs, TTS audio |
| `attachments_upload(...)` | `POST /attachments/upload` | voice recordings |
| `audio_transcribe(...)` | `POST /runs/{run}/audio/transcribe` | advisor push-to-talk |
| `voice_tts(...)` | `POST /runs/{run}/voice/tts` (and `/voice/tts/stream`) | advisor spoken replies |
| `voice_voices(...)` / `capability_defaults()` | `GET /voice/voices`, `GET /config/capability-defaults` | voice settings |
| `list_entities()` / `entity_state(name)` | `GET /entities`, `POST /entities/{name}/state` | Agents & Entities page |
| `entity_skills(name)` / `put_entity_skills(name, ...)` | `GET`/`PUT /entities/{name}/skills` | entity skills panel |

## Session endpoints (bundled server)

`bin/cli.js` (via `@abstractframework/app-server`, appId
`abstractcontinuum`):

- `GET /api/connection/gateway` — session status (`{ok, gateway_url, has_session, gateway}`)
- `POST /api/connection/gateway` — sign in `{gateway_url?, gateway_user_id, gateway_token, persist?}`
- `DELETE /api/connection/gateway` — sign out
- everything else under `/api/` — proxied to the gateway with the
  server-held session; mutating requests require the CSRF header
  (`x-abstractcontinuum-csrf` or `x-abstract-csrf`)

## Hub proxy endpoints (bundled server, Team page)

`bin/hub_proxy.js` serves the Team page's agora hub transport:

- `GET /api/hub/meta` — `{ok, hub_url, seat, seat_key_present}`
- `/api/hub/<hub path>` — forwarded to the hub with the seat key attached
  server-side, for an allowlisted set of routes only (channels, messages,
  DMs, channel info/members/files/ledger/digest/store, search, work,
  desk, owed asks, retraction, health); anything else is refused
- `GET /api/hub/ws` (WebSocket upgrade) — live hub updates relayed with the
  seat key attached server-side

Loopback peers only unless Continuum runs with `--hub-allow-remote` (setting
`hub_allow_remote`); browser requests whose `Origin` does not match the host
are rejected. The hub
contract the client is typed against is vendored in `vendor/hub/`.

## Server settings endpoint (bundled server, Settings page)

- `GET /api/continuum/settings` — `{settings, writable, settings_file}`:
  every server setting as `{value, source}` (`source` is `flag`, `setting`,
  `env` or `default`); the hub token only as `{set, source}`
- `PUT /api/continuum/settings` — `{"hub_seat": "<seat>"}` saves the seat
  to the settings file (`null` removes it); answers the fresh view. Other
  settings are refused here (`abstractcontinuum config set`)

Loopback peers and same-origin browser requests only; writes need
`Content-Type: application/json`.

## Notes

- Error contract: HTTP failures throw `Error("<method> failed: <detail>")`
  where detail is the response body when readable, else the HTTP status.
  Missing required arguments throw before any request is made, as
  `Error("<method>: <field> is required")`.
- The client is deliberately scoped to the families above: run-observation
  families (ledger streams, knowledge-graph queries) live in the observer's
  client, not here.
- Setup and first run: [getting-started.md](getting-started.md); how these
  families fit together: [architecture.md](architecture.md); failures such
  as `csrf_required` or an unavailable backlog folder:
  [troubleshooting.md](troubleshooting.md).
