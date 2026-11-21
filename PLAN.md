# Convox on Agora: build plan (21 Nov 2026)

Submit on Commudle by **12:30**. Code freeze **12:00**. Backup video by **11:30** at the latest.

## Stack decisions (locked)

| Piece | Choice | Why |
|---|---|---|
| Backend | Python, FastAPI, one process | Reuses Convox's `sarvam_mt.py` + `numbers.py` as-is |
| Public URL | `cloudflared tunnel --url` (install: `brew install cloudflared`) | Agora must reach `/llm/*` over HTTPS |
| Client | One static `client/index.html`, Agora Web SDK `agora-rtc-sdk-ng` from CDN, no build | Two phones open the same page |
| Mock platform | `GET /platform` page in the same backend + `POST /platform/webhook` | No second deploy |
| Live UI updates | SSE `GET /calls/{ch}/events` | Native `EventSource`, no socket lib |
| Agent model | `claude-haiku-5-5`, tool use, Anthropic SDK | Fast and cheap; runs off the translation path |
| State | In-memory dict keyed by channel | One demo box. ponytail: lost on restart, fine for a demo |

UIDs (numeric strings, so the Web SDK and Agora agree): rider `101`, customer `102`,
Agent-KN `201` (speaks Kannada and listens to the customer), Agent-HI `202` (speaks Hindi and listens to the rider).

## Backend routes

| Route | Does |
|---|---|
| `POST /calls` `{rider_lang, customer_lang, purpose?}` | New channel, RTC tokens for 101/102, starts both agents via Agora REST, returns join info |
| `POST /calls/{ch}/end` | Stops both agents, runs the end-of-call judgment (forced tool: `log_call_outcome` or `create_followup`) |
| `POST /llm/{ch}/{tgt}/chat/completions` | **Fast path.** Takes the last user message, runs Mayura to `tgt` and the number read-back, and streams OpenAI SSE chunks with native-script text. Appends the line to the call state and kicks the agent loop (fire and forget). Checks the bearer against `LLM_SHARED_KEY` |
| `GET /calls/{ch}/events` | SSE: transcript lines, call card changes, action log entries |
| `POST /calls/{ch}/confirm` `{detail_id, yes}` | Tap confirm from a phone |
| `POST /platform/webhook`, `GET /platform` | Mock platform: receives outcomes and follow-ups, then lists them |

## Agent loop (`agent.py`)

- Per channel there is at most one Claude run in flight. A new line while one is running sets a dirty flag, so it runs once more after the current run. (ponytail: coalescing, not a queue.)
- Input is the bilingual transcript (original + translation per line), the current card, and the context.
- Tools: `capture_detail`, `confirm_detail`, `log_call_outcome`, `create_followup` (+ `get_call_context`, `send_recap` later).
- During the call, `tool_choice: auto`. At the end of the call, `tool_choice: any` restricted to the two outcome tools.
- `confirm_detail` first shows a Yes/No tap on the listener's phone. A voice read-back via Agora's speak API is a stretch goal.
- Every tool call appends to the action log and is pushed over SSE.

## Timeline (now 09:30)

| By | Step | Done when |
|---|---|---|
| 09:45 | **0. Unblock.** Fill `.env`. Ask the Agora mentor: (a) do we use the `/api/conversational-ai-agent/v2/projects/{id}/join` inline config or the new `preview.ai.agora.io` sessions API, (b) the exact `asr.vendor=sarvam` and `tts.vendor=murf` param names, (c) does the LLM `url` get POSTed as-is with `stream:true`? Pick Murf Falcon voice IDs (kn, hi) from the event sheet | Field names written down |
| 10:20 | **1. One direction.** `/llm` endpoint + tunnel + one agent (customer hi to rider kn). Test with two browser tabs | You hear Kannada Murf audio from Hindi speech |
| 10:40 | **2. Both directions.** Second agent; the client plays only its own agent's track and never subscribes to the other human's audio | Two-phone call works both ways |
| 11:10 | **3. Agent + card.** Claude loop, `capture_detail`, call card + action log on both phones | "Gate 2" lands on the card |
| 11:30 | **4. End of call.** Judgment + webhook + `/platform` page. **Record the backup video right after** | Both demo scripts run end to end |
| 11:50 | 6. `confirm_detail` tap, 7. context / text language (only if 1 to 4 are solid) | |
| 12:00 | README, freeze, push repo | |
| 12:30 | Submit on Commudle (repo + video) | |

Cut order if late: 7, 6, the voice read-back, then the action log styling. Never cut the backup video.

## Fallbacks

- **Agora Sarvam ASR misbehaves:** use Agora's default ASR with `hi-IN`/`kn-IN`, keep everything else.
- **Murf in Agora misbehaves:** same; ask the mentor, and keep Murf as the stated voice.
- **Barge-in cuts translations:** raise `interrupt_duration_ms` or set interruption off, so each agent is only interrupted by its own speaker.
- **Claude slow or failing:** the translation path is unaffected by design; the card just fills later.

## Demo calls (scripted, short)

1. Ride pickup, resolved: the customer (hi) says "metro station gate number 2". It is captured, the rider taps yes, the call ends, and the outcome is logged.
2. Parcel, unresolved: the customer is not home, come after 7 PM, they don't agree on the neighbour, the call ends, and a follow-up appears on `/platform`.

## Reused from Convox (README must say so)

`backend/convox_agora/sarvam_mt.py` (Mayura client with English pivot, keep-alive) and
`backend/convox_agora/numbers.py` (digit-by-digit number read-back). Everything else is new today.
