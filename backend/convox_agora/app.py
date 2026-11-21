"""Convox on Agora: HTTP surface.

/llm/...      OpenAI-compatible endpoint Agora calls per utterance (the fast translation path)
/calls/...    create a call, join info for each phone, live events (SSE), tap-confirm, end
/platform/... mock platform that receives call outcomes and follow-ups by webhook
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

from convox_agora import agent, agora  # noqa: E402  (after load_dotenv: modules read env)
from convox_agora.numbers import readback  # noqa: E402
from convox_agora.sarvam_mt import ProviderError, SarvamMT  # noqa: E402
from convox_agora.state import AGENT_UID, CALLS, HUMAN_UID, ROLES, Call, Person  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("convox_agora")

PORT = int(os.environ.get("PORT", "8000"))
WEBHOOK_URL = os.environ.get("PLATFORM_WEBHOOK_URL", f"http://127.0.0.1:{PORT}/platform/webhook")
# Turns that are only a filler: the interpreter stays silent instead of speaking "yes" back.
FILLERS = {"haan", "haa", "han", "hmm", "hm", "ok", "okay", "achha", "accha", "हाँ", "हां", "हम्म",
           "ಹಾ", "ಹೂಂ", "ಸರಿ", "ಓಕೆ", "ओके", "अच्छा"}  # fmt: skip
PLATFORM: list[dict] = []  # ponytail: mock platform inbox in memory

http: httpx.AsyncClient
mt: SarvamMT
claude: AsyncAnthropic


@asynccontextmanager
async def lifespan(_: FastAPI):
    global http, mt, claude
    http = httpx.AsyncClient(timeout=10)
    mt = SarvamMT(os.environ.get("SARVAM_API_KEY", ""))
    claude = AsyncAnthropic()
    await mt.prewarm()
    yield
    await mt.aclose()
    await http.aclose()


app = FastAPI(title="Convox on Agora", lifespan=lifespan)


async def notify_platform(call: Call, record: dict) -> None:
    try:
        r = await http.post(WEBHOOK_URL, json=record)
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.error("platform.webhook_failed %r", e)
        call.add_log(f"Platform webhook failed: {type(e).__name__}")


def get_call(ch: str) -> Call:
    call = CALLS.get(ch)
    if call is None:
        raise HTTPException(404, "unknown call")
    return call


# ---------- translation fast path ----------

def _last_user_text(body: dict) -> str:
    for msg in reversed(body.get("messages") or []):
        if msg.get("role") == "user":
            c = msg.get("content")
            if isinstance(c, list):  # content parts
                return " ".join(p.get("text", "") for p in c if isinstance(p, dict))
            return str(c or "")
    return ""


def _is_filler(text: str) -> bool:
    words = text.strip(" .,!?।").lower().split()
    return not words or all(w.strip(".,!?।") in FILLERS for w in words)


def _chunk(cid: str, delta: dict, finish: str | None) -> str:
    payload = {"id": cid, "object": "chat.completion.chunk", "created": int(time.time()),
               "model": "convox-interp",
               "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.post("/llm/{ch}/{speaker}/chat/completions")
@app.post("/llm/{ch}/{speaker}")
async def llm(ch: str, speaker: str, request: Request):
    if request.headers.get("authorization", "") != f"Bearer {os.environ.get('LLM_SHARED_KEY', '')}":
        raise HTTPException(401, "bad key")
    if speaker not in ROLES:
        raise HTTPException(404, "unknown speaker")
    call = get_call(ch)
    body = await request.json()
    text = _last_user_text(body).strip()
    src, dst = call.people[speaker], call.other(speaker)
    out = ""
    if not _is_filler(text) and not call.ended:
        t0 = time.monotonic()
        try:
            out = await mt.translate(text, src.speak_lang, dst.speak_lang, src.gender)
            out, _ = readback(text, out, dst.speak_lang)
        except ProviderError as e:
            log.error("mt.failed %s", e)
            call.add_log(f"Translation failed: {e}")
        call.add_line(speaker, text, out, int((time.monotonic() - t0) * 1000))
        if out:
            agent.kick(call, claude, notify_platform)
    cid = f"chatcmpl-{secrets.token_hex(6)}"
    if not body.get("stream", False):
        return {"id": cid, "object": "chat.completion", "created": int(time.time()),
                "model": "convox-interp",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": out},
                             "finish_reason": "stop"}]}

    async def stream():
        yield _chunk(cid, {"role": "assistant", "content": out}, None)
        yield _chunk(cid, {}, "stop")
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------- calls ----------

class PersonIn(BaseModel):
    speak_lang: str = Field(pattern=r"^[a-z]{2}-IN$")
    text_lang: str | None = Field(default=None, pattern=r"^[a-z]{2}-IN$")
    gender: str | None = Field(default=None, pattern=r"^[mf]$")


class CallIn(BaseModel):
    rider: PersonIn = PersonIn(speak_lang="kn-IN", gender="m")
    customer: PersonIn = PersonIn(speak_lang="hi-IN", gender="f")
    purpose: str | None = Field(default=None, max_length=80)


@app.post("/calls")
async def create_call(body: CallIn):
    ch = f"cvx{secrets.token_hex(4)}"
    people = {
        role: Person(role, p.speak_lang, p.text_lang or p.speak_lang, p.gender)
        for role, p in (("rider", body.rider), ("customer", body.customer))
    }
    base = os.environ.get("PUBLIC_URL", "")
    call = Call(channel=ch, people=people, purpose=body.purpose,
                links={r: f"{base}/phone?ch={ch}&role={r}" for r in ROLES})
    CALLS[ch] = call
    call.add_log(f"Context loaded: rider {people['rider'].speak_lang}, customer "
                 f"{people['customer'].speak_lang}, purpose {body.purpose or 'unknown'}",
                 "get_call_context")
    await agora.start_agents(call, http)
    return {"channel": ch, "agents": call.agent_ids,
            "links": call.links}


@app.get("/calls/{ch}/join")
async def join_info(ch: str, role: str):
    call = get_call(ch)
    if role not in ROLES:
        raise HTTPException(400, "role must be rider or customer")
    uid = HUMAN_UID[role]
    return {"app_id": os.environ.get("AGORA_APP_ID", ""), "channel": ch, "uid": int(uid),
            "token": agora.rtc_token(ch, uid), "play_uid": int(AGENT_UID[role]),
            "me": vars(call.people[role]), "other": vars(call.other(role))}


@app.get("/calls/{ch}")
async def call_snapshot(ch: str):
    return get_call(ch).snapshot()


@app.get("/calls/{ch}/events")
async def events(ch: str, request: Request):
    call = get_call(ch)
    q: asyncio.Queue = asyncio.Queue()
    call.subs.add(q)

    async def gen():
        try:
            yield f"event: snapshot\ndata: {json.dumps(call.snapshot(), ensure_ascii=False)}\n\n"
            while not await request.is_disconnected():
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"event: {ev['kind']}\ndata: {json.dumps(ev['data'], ensure_ascii=False)}\n\n"
        finally:
            call.subs.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream")


class PresenceIn(BaseModel):
    role: str


@app.post("/calls/{ch}/presence")
async def presence(ch: str, body: PresenceIn):
    call = get_call(ch)
    if body.role not in ROLES:
        raise HTTPException(400, "role must be rider or customer")
    if not call.joined.get(body.role):
        call.joined[body.role] = True
        call.publish("presence", {"role": body.role})
        call.add_log(f"{body.role.capitalize()} phone joined the Agora channel")
    return {"ok": True}


class ConfirmIn(BaseModel):
    detail_id: str
    role: str
    yes: bool


@app.post("/calls/{ch}/confirm")
async def confirm(ch: str, body: ConfirmIn):
    call = get_call(ch)
    detail = call.details.get(body.detail_id)
    if detail is None:
        raise HTTPException(404, "unknown detail")
    if detail.get("confirm_by") != body.role:
        raise HTTPException(403, "not yours to confirm")
    detail["status"] = "confirmed" if body.yes else "rejected"
    call.publish("detail", detail)
    call.add_log(f"{detail['value']} {detail['status']} by {body.role}", "confirm_detail")
    call.add_line("system", f"{body.role} {detail['status']} {detail['type']}: {detail['value']}", "", 0)
    return detail


@app.post("/calls/{ch}/end")
async def end_call(ch: str):
    call = get_call(ch)
    if call.ended:
        return call.snapshot()
    call.ended = True
    call.add_log("Call ended")
    await agora.stop_agents(call, http)
    try:
        await agent.judge(call, claude, notify_platform)
    except Exception:
        log.exception("agent.judge_failed")
        call.add_log("End-of-call judgment failed")
    call.publish("ended", {"outcome": call.outcome})
    return call.snapshot()


# ---------- mock platform ----------

@app.post("/platform/webhook")
async def platform_webhook(record: dict):
    PLATFORM.insert(0, {**record, "received_at": time.time()})
    return {"ok": True}


@app.get("/platform/items")
async def platform_items():
    return PLATFORM


@app.get("/platform")
async def platform_page():
    return FileResponse(ROOT / "mock-platform" / "index.html")


@app.get("/")
async def host_page():
    return FileResponse(ROOT / "client" / "index.html")


@app.get("/phone")
async def phone_page():
    return FileResponse(ROOT / "client" / "phone.html")


app.mount("/static", StaticFiles(directory=ROOT / "client" / "static"), name="static")


@app.get("/health")
async def health():
    return JSONResponse({"ok": True, "agents_enabled": agora.can_start_agents()})
