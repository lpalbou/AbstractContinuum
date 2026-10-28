# Completed: the backlog advisor follows the kit's message footer spec (0.7.6)

## Metadata
- Created: 2026-10-28
- Status: Completed (0.7.6)
- Area: `src/ui/backlog/advisor_drawer.tsx` (panel-chat `ChatThread`)

## Summary
Operator QA 2026-10-28, item 2: "we wanted both the speaker and copy icons permanent; where is the speaker? Show the
date when the message is not from today." The message footer is a shared primitive (AbstractUIC ADR 0001): the spec
is written once in panel-chat 0.6.4 (`message_footer.ts`, AbstractUIC backlog 0064) and this app adopts it by pin
bump, with no local twin of the card.

## What changes here
- `@abstractframework/panel-chat` ^0.6.4 (lockfile refreshed): in the advisor, the AI Assist of a new task and the app
  assistant, a message not from today is stamped with its date ("Yesterday · 10:52 PM", "Oct 21 · 10:52 PM"); in the
  advisor a reply with no text keeps its speaker (disabled with the reason). These threads carry no statistics and no
  live state, so the chip and streaming parts of the spec do not apply here.

## Evidence
- The kit check `panel-chat/scripts/check_message_footer.mjs` (56 checks, mutation-checked) pins the behaviour.
- This app: tests and build green on the bumped pin (see the PR).

## Not a twin
- The Team page's hub message rows (`src/ui/team_page.tsx`, agora messages with +1/-1, Reply, Retract and a speaker)
  are a different surface from a chat message card and keep their own actions. Their speaker could take the kit's
  state table (`speakButtonView`: spinner only while loading, Pause, Resume) instead of its local
  "refresh"/"pause" icons; follow-up, not done in this pass.
