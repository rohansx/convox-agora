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
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

from convox_agora import agent, agora, persona  # noqa: E402  (after load_dotenv: modules read env)
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
PLATFORM: list[dict] = []  # mock platform inbox, newest first; persisted next to the call archive
# Ended calls are kept as JSON so the dashboard survives a restart.
# ponytail: one file per call, read back whole; a database when there are more than a few hundred.
ARCHIVE = Path(os.environ.get("CONVOX_DATA_DIR", ROOT / "data")) / "calls"


def archive(call: Call) -> None:
    try:
        ARCHIVE.mkdir(parents=True, exist_ok=True)
        (ARCHIVE / f"{call.channel}.json").write_text(json.dumps(call.snapshot(), ensure_ascii=False))
    except OSError as e:
        log.error("archive.failed %s %r", call.channel, e)


def inbox_file() -> Path:
    return ARCHIVE.parent / "platform.jsonl"


def load_inbox() -> list[dict]:
    """The mock platform's inbox survives restarts. First run: rebuilt from archived outcomes."""
    items: list[dict] = []
    try:
        if inbox_file().exists():
            items = [json.loads(ln) for ln in inbox_file().read_text().splitlines() if ln.strip()]
        else:
            items = [{**c["outcome"], "received_at": c["outcome"].get("t", 0)}
                     for c in archived() if c.get("outcome")]
    except (OSError, ValueError) as e:
        log.error("inbox.load_failed %r", e)
    return sorted(items, key=lambda r: r.get("received_at", 0), reverse=True)


def archived() -> list[dict]:
    out = []
    for f in ARCHIVE.glob("*.json") if ARCHIVE.exists() else []:
        try:
            out.append(json.loads(f.read_text()))
        except (OSError, ValueError) as e:
            log.warning("archive.unreadable %s %r", f.name, e)
    return out

# Unicode block of each listener language's script. Mayura's code-mixed mode sometimes returns a
# short line entirely in English (e.g. "Yes, absolutely correct" for a Kannada listener).
SCRIPTS = {"kn": (0x0C80, 0x0CFF), "hi": (0x0900, 0x097F), "mr": (0x0900, 0x097F),
           "ta": (0x0B80, 0x0BFF), "te": (0x0C00, 0x0C7F), "gu": (0x0A80, 0x0AFF),
           "bn": (0x0980, 0x09FF), "ml": (0x0D00, 0x0D7F)}


def in_script(text: str, lang: str) -> bool:
    lo_hi = SCRIPTS.get(lang[:2])
    return lo_hi is None or any(lo_hi[0] <= ord(c) <= lo_hi[1] for c in text)


http: httpx.AsyncClient
mt: SarvamMT
mt_formal: SarvamMT  # fallback when the colloquial output has none of the listener's script
claude: AsyncAnthropic


@asynccontextmanager
async def lifespan(_: FastAPI):
    global http, mt, mt_formal, claude
    http = httpx.AsyncClient(timeout=10)
    mt = SarvamMT(os.environ.get("SARVAM_API_KEY", ""))
    mt_formal = SarvamMT(os.environ.get("SARVAM_API_KEY", ""), mode="formal")
    claude = AsyncAnthropic()
    PLATFORM[:] = load_inbox()
    await mt.prewarm()
    yield
    await mt.aclose()
    await mt_formal.aclose()
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


async def interpret(call: Call, text: str, src: Person, dst: Person) -> str:
    """One line into the listener's language: Mayura, native-script fallback, number read-back."""
    try:
        out = await mt.translate(text, src.speak_lang, dst.speak_lang, src.gender)
        if out and not in_script(out, dst.speak_lang):
            log.info("mt.retry_formal %r", out)
            out = await mt_formal.translate(text, src.speak_lang, dst.speak_lang, src.gender)
        return readback(text, out, dst.speak_lang)[0]
    except ProviderError as e:
        log.error("mt.failed %s", e)
        call.add_log(f"Translation failed: {e}")
        return ""


async def persona_turn(call: Call, ai: Person, human: Person) -> str:
    """/demo: Claude answers as the rider or delivery agent in their language; Convox interprets it."""
    t0 = time.monotonic()
    try:
        said = await persona.reply(call, claude)
    except Exception:
        log.exception("persona.failed")
        return ""
    if not said:
        return ""
    t1 = time.monotonic()
    heard = await interpret(call, said, ai, human)
    call.add_line(ai.role, said, heard, int((time.monotonic() - t1) * 1000))
    log.info("persona.turn reply_ms=%d", int((t1 - t0) * 1000))
    return heard


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
        out = await interpret(call, text, src, dst)
        call.add_line(speaker, text, out, int((time.monotonic() - t0) * 1000))
        if out and call.ai_role:  # /demo: the persona answers; the human hears its answer
            out = await persona_turn(call, dst, src)
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
    if ch in CALLS:
        return CALLS[ch].snapshot()
    f = ARCHIVE / f"{ch}.json"
    if not ch.isalnum() or not f.exists():  # isalnum: the channel names a file
        raise HTTPException(404, "unknown call")
    return json.loads(f.read_text())


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


DEMO_LANGS = r"^(hi|kn|mr|ml|ta|te|en)-IN$"


class DemoIn(BaseModel):
    story: str
    lang: str = Field(default="hi-IN", pattern=DEMO_LANGS)
    ai_lang: str | None = Field(default=None, pattern=DEMO_LANGS)


@app.get("/demo/stories")
async def demo_stories():
    return {k: {f: v[f] for f in ("title", "headline", "stakes", "name", "role")}
            for k, v in persona.STORIES.items()}


@app.post("/demo/calls")
async def create_demo_call(body: DemoIn):
    """You are the customer; Claude plays the rider or delivery agent, who speaks the other language."""
    story = persona.STORIES.get(body.story)
    if story is None:
        raise HTTPException(404, "unknown story")
    ai_lang = body.ai_lang or ("hi-IN" if body.lang == "kn-IN" else "kn-IN")
    if ai_lang == body.lang:
        raise HTTPException(400, "pick two different languages")
    ch = f"cvx{secrets.token_hex(4)}"
    people = {"rider": Person("rider", ai_lang, ai_lang, story["gender"]),
              "customer": Person("customer", body.lang, body.lang, None)}
    call = Call(channel=ch, people=people, purpose=story["purpose"], ai_role="rider", story=body.story,
                joined={"rider": True})
    CALLS[ch] = call
    call.add_log(f"Context loaded: you {body.lang}, {story['name']} ({story['role']}, AI) {ai_lang}, "
                 f"purpose {story['purpose']}", "get_call_context")
    said = story["greeting"].get(ai_lang)
    if said is None:  # no scripted greeting in this language: Mayura writes it from the Kannada one
        said = await interpret(call, story["greeting"]["kn-IN"], Person("x", "kn-IN", "kn-IN", "m"),
                               people["rider"]) or story["greeting"]["hi-IN"]
    heard = await interpret(call, said, people["rider"], people["customer"])
    call.add_line("rider", said, heard, 0)
    await agora.start_agents(call, http, greeting=heard)
    return {"channel": ch, "agents": call.agent_ids}


MURF_STREAM = "https://api.murf.ai/v1/speech/stream"


@app.get("/calls/{ch}/audio/{n}")
async def line_audio(ch: str, n: int, part: str = "text"):
    """A line as one phone hears it, spoken by Murf Falcon: part=text is what the speaker said (their
    language), part=translation is what the listener heard. For /demo's "hearing both phones"."""
    call = get_call(ch)
    if not 1 <= n <= len(call.lines) or part not in ("text", "translation"):
        raise HTTPException(404, "no such line")
    line = call.lines[n - 1]
    if line["speaker"] not in ROLES or not line[part]:
        raise HTTPException(404, "nothing to say")
    speaker = call.people[line["speaker"]]
    lang = speaker.speak_lang if part == "text" else call.other(speaker.role).speak_lang
    body = {"voiceId": agora.voice_for(lang, speaker.gender), "text": line[part], "model": "FALCON",
            "multiNativeLocale": lang, "format": "MP3"}
    try:
        r = await http.post(MURF_STREAM, json=body, headers={"api-key": os.environ.get("MURF_API_KEY", "")},
                            timeout=15)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"murf: {type(e).__name__}") from e
    if r.status_code >= 400:
        log.error("murf.failed %s %s", r.status_code, r.text[:200])
        raise HTTPException(502, f"murf: HTTP {r.status_code}")
    return Response(r.content, media_type="audio/mpeg", headers={"cache-control": "max-age=3600"})


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
    archive(call)
    return call.snapshot()


# ---------- mock platform ----------

@app.post("/platform/webhook")
async def platform_webhook(record: dict):
    item = {**record, "received_at": time.time()}
    PLATFORM.insert(0, item)
    try:
        inbox_file().parent.mkdir(parents=True, exist_ok=True)
        with inbox_file().open("a") as f:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    except OSError as e:
        log.error("inbox.save_failed %r", e)
    return {"ok": True}


@app.get("/platform/items")
async def platform_items():
    return PLATFORM


@app.get("/platform")
async def platform_page():
    return FileResponse(ROOT / "mock-platform" / "index.html")


SPA = (ROOT / "client" / "app").resolve()  # the partner dashboard (dashboard/, React + shadcn)


@app.get("/")
async def root():
    return RedirectResponse("/app/")


@app.get("/app/{path:path}")
async def dashboard_spa(path: str):
    f = (SPA / path).resolve()
    if path and f.is_file() and f.is_relative_to(SPA):
        return FileResponse(f)
    return FileResponse(SPA / "index.html")  # client-side routes: /app/calls, /app/followups, ...


@app.get("/dashboard/data")
async def dashboard_data():
    """Every call, newest first: live ones from memory, ended ones from the archive."""
    calls = {c["channel"]: c for c in archived()}
    calls.update({ch: c.snapshot() for ch, c in CALLS.items()})
    return sorted(calls.values(), key=lambda c: c.get("created_at", 0), reverse=True)


@app.get("/call")
async def host_page():
    return FileResponse(ROOT / "client" / "index.html")


@app.get("/demo")
async def demo_page():
    return FileResponse(ROOT / "client" / "demo.html")


@app.get("/phone")
async def phone_page():
    return FileResponse(ROOT / "client" / "phone.html")


app.mount("/static", StaticFiles(directory=ROOT / "client" / "static"), name="static")


@app.get("/health")
async def health():
    return JSONResponse({"ok": True, "agents_enabled": agora.can_start_agents()})
