"""Agora: RTC tokens and Conversational AI agents (one per direction).

Agent for listener L: listens to the other human (ASR in their language), our /llm endpoint
translates into L's language, Murf Falcon speaks it. Field names follow the v2 `join` API;
the VERIFY lines are the ones to confirm with an Agora mentor.
"""

from __future__ import annotations

import base64
import logging
import os
import time

import httpx
from agora_token_builder import RtcTokenBuilder

from convox_agora.state import AGENT_UID, HUMAN_UID, Call

log = logging.getLogger(__name__)

API = "https://api.agora.io/api/conversational-ai-agent/v2/projects"
TOKEN_TTL_S = 6 * 3600
PUBLISHER = 1


def env(name: str) -> str:
    return os.environ.get(name, "")


def rtc_token(channel: str, uid: str) -> str:
    expires = int(time.time()) + TOKEN_TTL_S
    return RtcTokenBuilder.buildTokenWithUid(
        env("AGORA_APP_ID"), env("AGORA_APP_CERTIFICATE"), channel, int(uid), PUBLISHER, expires
    )


def can_start_agents() -> bool:
    return all(env(k) for k in ("AGORA_CUSTOMER_ID", "AGORA_CUSTOMER_SECRET", "PUBLIC_URL"))


def _auth() -> dict[str, str]:
    raw = f"{env('AGORA_CUSTOMER_ID')}:{env('AGORA_CUSTOMER_SECRET')}".encode()
    return {"Authorization": f"Basic {base64.b64encode(raw).decode()}"}


# Murf Falcon voices, by language and the gender of the person whose words are spoken.
# kn male: a multi-native Hindi voice that speaks Kannada (Murf has no native male kn voice).
VOICES = {
    ("kn-IN", "f"): "kn-IN-harshitha", ("kn-IN", "m"): "hi-IN-chirag",
    ("hi-IN", "f"): "hi-IN-khyati", ("hi-IN", "m"): "hi-IN-aman",
    ("ta-IN", "m"): "ta-IN-karthikeyan", ("ta-IN", "f"): "hi-IN-poonam",
    ("te-IN", "m"): "en-IN-samar", ("te-IN", "f"): "en-IN-anisha",
    ("mr-IN", "m"): "mr-IN-prathamesh", ("mr-IN", "f"): "hi-IN-rachna",
    ("ml-IN", "m"): "ml-IN-madhavan", ("ml-IN", "f"): "hi-IN-poonam",
}


def voice_for(lang: str, gender: str | None) -> str:
    return VOICES.get((lang, gender or "f")) or VOICES.get((lang, "f")) or "hi-IN-khyati"


def join_body(call: Call, listener: str, hears_from: str, voice_gender: str | None,
              greeting: str | None = None) -> dict:
    """One agent: listens to `hears_from` (ASR in their language), our /llm endpoint produces the
    line, Murf speaks it to `listener` in their language. Two-person calls: hears_from is the other
    human. /demo: hears_from is the listener themself, and /llm answers as the persona."""
    hears = call.people[listener]
    speaker = call.people[hears_from]
    agent_uid = AGENT_UID[listener]
    llm: dict = {
        "url": f"{env('PUBLIC_URL')}/llm/{call.channel}/{hears_from}/chat/completions",
        "api_key": env("LLM_SHARED_KEY"),
        "max_history": 2,
        "system_messages": [],
        "params": {"model": "convox-interp"},
    }
    if greeting:
        llm["greeting_message"] = greeting
    return {
        "name": f"convox-{call.channel}-{listener}",
        "properties": {
            "channel": call.channel,
            "token": rtc_token(call.channel, agent_uid),
            "agent_rtc_uid": agent_uid,
            "remote_rtc_uids": [HUMAN_UID[speaker.role]],  # listen to exactly one human
            "idle_timeout": 120,
            "asr": {  # VERIFY: sarvam vendor param names
                "vendor": "sarvam",
                "language": speaker.speak_lang,
                "params": {"api_key": env("SARVAM_API_KEY"), "language": speaker.speak_lang},
            },
            "llm": llm,
            "tts": {  # VERIFY: murf vendor param names
                "vendor": "murf",
                "params": {
                    "api_key": env("MURF_API_KEY"),
                    "model": "FALCON",
                    "voice_id": voice_for(hears.speak_lang, voice_gender),
                    "locale": hears.speak_lang,
                },
            },
        },
    }


async def _join(call: Call, client: httpx.AsyncClient, listener: str, body: dict) -> None:
    r = await client.post(f"{API}/{env('AGORA_APP_ID')}/join", json=body, headers=_auth())
    if r.status_code >= 400:
        log.error("agora.join_failed %s %s", r.status_code, r.text)
        call.add_log(f"Agent for {listener} failed to join: HTTP {r.status_code} {r.text[:200]}")
        return
    call.agent_ids[listener] = r.json()["agent_id"]
    call.add_log(f"Interpreter joined for the {listener} ({call.people[listener].speak_lang})")


async def start_agents(call: Call, client: httpx.AsyncClient, greeting: str | None = None) -> None:
    if not can_start_agents():
        call.add_log("Agora agents not started: AGORA_CUSTOMER_* or PUBLIC_URL missing")
        return
    if call.ai_role:  # /demo: one agent, between the human and the persona
        human = call.other(call.ai_role).role
        body = join_body(call, human, human, call.people[call.ai_role].gender, greeting)
        await _join(call, client, human, body)
        return
    for listener in ("rider", "customer"):
        speaker = call.other(listener)
        await _join(call, client, listener, join_body(call, listener, speaker.role, speaker.gender))


async def stop_agents(call: Call, client: httpx.AsyncClient) -> None:
    for listener, agent_id in list(call.agent_ids.items()):
        r = await client.post(
            f"{API}/{env('AGORA_APP_ID')}/agents/{agent_id}/leave", headers=_auth()
        )
        if r.status_code >= 400 and r.status_code != 404:
            log.warning("agora.leave_failed %s %s", r.status_code, r.text)
        call.agent_ids.pop(listener, None)
