# Proposed: consume exec-request SSE (log cursor half DONE 2026-07-12)

## Metadata
- Created: 2026-07-12
- Status: Proposed (ask 2 delivered + consumed same day; only the SSE half remains)
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The Executions page and the backlog Processing tab poll
`GET /backlog/exec/requests` every 2s per client and re-download the whole
log tail (up to 160 KB) every 1.5s while a request runs. The gateway
recently moved its run-ledger and entity-replay streams to cursored,
off-loop SSE — the same pattern fits the exec pipeline.

Asked of the gateway seat on agora commons **c1072** (2026-07-12), with an
explicit alternative: if exec events already land in a run ledger the
existing `/runs/{id}/ledger/stream` serves, we consume that instead and
drop both asks.

## Current code reality
- `use_exec_pipeline.ts`: `setInterval` polling for the request LIST (2s);
  the log tail now follows via the byte cursor (delta appends, rotation
  reset, ref-based in-flight guards, 1 MB client buffer cap).
- `gateway_client.ts`: `backlog_exec_log_tail` takes `after_bytes` and
  types `next_offset`/`reset`; `backlog_exec_requests` remains poll-only
  (the SSE half of this item).

## Problem or opportunity
Polling is correct but costs latency (status flips show up to 2s late) and
bandwidth (full tail re-sent ~40×/minute per open client).

## Proposed direction
1. SSE request stream → replace the list poll with a subscription (keep the
   poll as `#FALLBACK` for older gateways). Gateway confirmed the shape on
   commons c1075 (run-ledger SSE pattern: monotonic `id:`, Last-Event-ID
   resume, count-probe idle) — building after their fleet leg.
2. ~~`after_bytes` cursor on the tail~~ — **DONE 2026-07-12**: gateway
   shipped `after_bytes` → delta + `next_offset` + `reset` (c1075); consumed
   in `use_exec_pipeline` (per-follow byte cursor, rotation reset, 1MB
   client buffer cap, `#FALLBACK` to whole-tail on pre-cursor gateways) and
   pinned in `use_exec_pipeline.test.tsx` (c1078).

Note from the gateway (c1075): exec-pipeline runs are codex subprocess
runs writing files, NOT RunState runs with a StepRecord ledger — the
run-ledger stream can never serve them; these endpoints are the equivalent
contract for the file substrate.

## Why it might matter
The Executions page is the app's landing surface; its freshness defines the
product feel. Sub-second status flips also make QA handoffs snappier.

## Promotion criteria
Gateway answers c1072 with a shipped endpoint (or points at the ledger
stream alternative).

## Validation ideas
- Component test with a scripted SSE stream; fallback test against the
  polling path; manual soak with a long-running execution.

## Non-goals
- Client-side workarounds that fake streaming over the current endpoints
  (explicitly ruled out — discuss with the gateway first, which happened).
