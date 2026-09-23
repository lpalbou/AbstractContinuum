# Completed: per-message ±1 reactions + agent/channel thumbs (operator dm 82)

> Priority: P1
> Labels: operator-intake, team-page
> Type: feature

- Work id: `abstractcontinuum-0013`
- Thread anchor: operator dm 82 ("in dm, this is not working. i should be
  able to +1 -1 on each message. same for agents, same for channels. we
  can do that on every message. fix it") + screenshot.
- Created: 2026-07-18
- Status: Completed
- Completed: 2026-07-18

## Diagnosis (why it read as broken)

The rail thumbs were AUTHOR-level trust votes (dm 16): one live vote per
(rater, author, axis, channel) hub-side. In a DM every message shares one
author, so a +1 on one message showed pressed on ALL of them, and clicking
a different message's thumb WITHDREW the same vote — correct reputation
semantics, wrong per-message mental model. Failures were also invisible:
`vote_error` rendered only inside the Leaderboard drawer.

## What shipped

- Per-MESSAGE reactions: `reactions:<msg id>` rows in the channel store
  (`{up: [seats], down: [seats]}`), CAS-guarded (`expect_version`, one
  re-read retry on conflict). Pure fold in `team_model.ts`
  (`toggle_reaction` / `normalize_reaction` / `reaction_tally`) — same
  direction withdraws, opposite revises, one direction per seat; peer-
  authored corruption repairs deterministically (non-strings dropped,
  both-lists conflict keeps UP).
- Rail thumbs now react to THE MESSAGE (own messages included) with
  live counts; an always-visible `▲n ▼n` tally sits in the row header
  (title lists who). Loading: one store-keys listing per poll, values
  fetched only on version change.
- "Same for agents": Members drawer rows carry trust thumbs — the
  author-level reputation act (toggle-off, two-step down-vote) moved to
  where agents are listed.
- "Same for channels": the About drawer header carries channel-level
  thumbs (`reactions:channel` row, same fold).
- Proxy: `PUT store/reactions:<id>` allowlisted (channel:meta stays the
  only other writable store key; pins updated). `vote_error` now renders
  in the main status strip (headless-verified: the pre-restart proxy 403
  reads "±1 failed: … outside the Team page allowlist").

## Receipts

- Suite 277 green (reaction fold pins + allowlist pins), tsc + build clean.
- Headless: thumbs on every message (own included), error strip visible on
  refusal, 2 member-row thumbs + 1 channel cluster in the Members drawer.

## Honest gates + follow-up

- ACTIVATES at the next console restart (running proxy predates the
  reactions route — same restart the /group invites + S3 store reads wait
  on). Until then clicks show the labeled refusal.
- Store rows are member-writable (any seat could write another's name).
  The console writes through the operator's authenticated proxy; a
  first-class identity-bound reactions surface is proposed to agora
  (hub-side, like reputation) — migration is a render swap.
- RULED (agora c3065, consumed c3069): reactions stay SEPARATE from
  reputation (self-ALLOWED lightweight signal vs self-REFUSED axed
  judgment); the store convention is the ENDORSED shape until a
  non-proxy writer exists; hub primitive = agora backlog 0095
  (`PUT /channels/{c}/messages/{id}/reactions`, rater = authed caller,
  aggregate folded into the message envelope). TRIGGER contract: flag
  agora the moment agent-to-agent reactions reach the near horizon —
  0095 builds BEFORE they ship (forgery-surface class).
