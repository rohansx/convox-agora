# Convox on Agora

**Live:** https://app.convox.ai · **Try it:** https://app.convox.ai/demo · Build with Agora, Bengaluru · Track: *Voice AI for Bharat: Speak Your Language*

A Kannada-speaking rider and a Hindi-speaking customer can't understand each other on a call. Details get lost, and the pickup or delivery fails. **Convox sits between the two people on a live call**: each speaks and hears their own language through a Murf Falcon voice. While they talk, a Claude agent captures the details that matter (gate, flat, OTP, time, amount) on a live call card and asks the other person to confirm them. When the call ends, it judges whether the two reached an understanding and sends the platform one standard record: *resolved*, or a *follow-up* with the reason and a suggested next step.

Most voice agents are one person talking to a bot. Convox interprets between two people.

## What to try

| Page | What it is |
|---|---|
| [`/demo`](https://app.convox.ai/demo) | **Try it live.** You are the customer; an AI rider (Ravi) or delivery agent (Suresh), played by Claude, speaks only his own language. Pick both languages (Hindi, Kannada, Tamil, Telugu, Marathi, Malayalam, English). |
| [`/call`](https://app.convox.ai/call) | **Two-phone call.** Two people scan a QR each and talk; two mock phones show each side live. |
| [`/app`](https://app.convox.ai/app) | **Partner dashboard.** Every call, outcome donut, translation delay, tool calls, follow-ups queue, per-call detail with a timeline of lines and agent actions. *Demo data* switch in the sidebar. |
| [`/platform`](https://app.convox.ai/platform) | **Mock fleet platform.** Receives Convox's webhook (`/platform/webhook`): one record per call. |

## Architecture

```
 Rider phone (kn)                                   Customer phone (hi)
   publishes mic, plays Agent-KN only                 publishes mic, plays Agent-HI only
        |                                                   |
        +-------------------- Agora RTC channel ------------+
                 |                                   |
   Agent for the customer                  Agent for the rider
   ASR: Sarvam (rider's language)          ASR: Sarvam (customer's language)
   LLM: Convox /llm (translate)            LLM: Convox /llm (translate)
   TTS: Murf Falcon (customer's language)  TTS: Murf Falcon (rider's language)
                 |                                   |
                 +---------- Convox backend ---------+
                    /llm: OpenAI-compatible endpoint Agora calls per utterance
                      -> Sarvam Mayura translation + digit-by-digit number check
                      -> streams the line back for Murf to speak
                    shared call state (both directions, keyed by channel)
                    Claude agent in the background, with tools
                    webhook to the platform, dashboard, live pages (SSE)
```

- **Two Agora Conversational AI agents per call, one per direction.** One agent produces one voice; each phone plays only the agent that speaks its language and never the other person's raw voice. Each agent listens to exactly one human (`remote_rtc_uids`).
- **The LLM slot is our translator**, not a chatbot: Agora sends each finished utterance to `/llm/{channel}/{speaker}/chat/completions`; we translate it (Sarvam Mayura, with a native-script fallback) and keep numbers intact (`47296` stays `47296`).
- **Turn detection** tuned for noisy venues (`turn_detection` in the join request).
- **/demo**: one agent; the persona (Claude Sonnet) answers in its own language and that answer is interpreted back the same way.

## Tool calling (Claude)

The translation path has no tools and stays fast. After each line, a **Claude Sonnet 5.5** agent reads the bilingual transcript in the background and may act; at the end of the call **Claude Opus 5.5** judges it.

| Tool | When | What our code does |
|---|---|---|
| `get_call_context` | start | Loads both people's languages and the call purpose |
| `capture_detail` | during | Adds a fact (meeting point, address, OTP, time, amount, name) to the call card, in each person's language |
| `confirm_detail` | during | Asks the person who did *not* say it to confirm (Yes/No on their phone) |
| `log_call_outcome` | end, resolved or unclear | Posts one standard record to the platform webhook |
| `create_followup` | end, unresolved | Posts a follow-up: reason, summary, suggested next step |

Every tool call is shown live in the action log, the dashboard's *Tool calls* page and each call's timeline.

## Stack

| | |
|---|---|
| Voice transport, agents, turn detection | **Agora Conversational AI Engine** (v2 join API), Agora Web SDK |
| Speech recognition | **Sarvam** (Agora's `sarvam` ASR vendor) |
| Voices | **Murf Falcon** (Agora's `murf` TTS vendor): `kn-IN-harshitha`, `hi-IN-aman`, `mr-IN-prathamesh`, `ml-IN-madhavan`, `en-IN-aarav`… |
| Translation | Sarvam **Mayura** (`mayura:v1`, 11 languages) |
| Agent | **Claude** Sonnet 5.5 (persona, in-call tools), Opus 5.5 (end-of-call judgment) |
| Backend | Python, FastAPI, one process; calls archived as JSON (survive restarts) |
| UI | Live pages in plain HTML/CSS; partner dashboard in React + shadcn + Recharts |

## What existed in Convox before, and what was built here

Convox is a live phone interpreter for Indian languages (Exotel telephony, Sarvam speech and translation). **Reused from Convox:**
- `backend/convox_agora/sarvam_mt.py`: the Mayura client (English pivot, keep-alive).
- `backend/convox_agora/numbers.py`: the digit-by-digit number read-back.
- Visual design: `landing.css`, `try.css` (the convox.ai/try page), `join.css` (the stage demo), and the partner dashboard's React/shadcn shell (`dashboard/`).

**Built at this event:** the Agora transport (two agents per call, tokens, join/leave, turn detection), Murf Falcon voices, the OpenAI-compatible `/llm` interpreter endpoint, the Claude agent and all five tools, the end-of-call judgment, the platform webhook and inbox, `/demo` with Claude personas, the two-phone `/call` page, and the dashboard pages (overview, calls, call detail, follow-ups, tool calls).

## Run it

```bash
cp .env.example .env        # Agora app id/cert/customer key, Sarvam, Murf, Anthropic, PUBLIC_URL
cd backend && uv sync && uv run uvicorn convox_agora.app:app --port 8000
cloudflared tunnel --url http://localhost:8000   # Agora must reach /llm over HTTPS; put the URL in PUBLIC_URL
# dashboard: cd dashboard && npm ci && npx vite build   (served at /app)
# deploy: ./deploy/push.sh   (Docker + Traefik on the VPS, app.convox.ai)
```

## Scale

The same engine runs on masked phone calls through Exotel in production. One outcome format means no per-platform integration: every fleet gets the same webhook.
