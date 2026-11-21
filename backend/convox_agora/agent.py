"""Claude agent loop: runs in the background after each line, never on the translation path.

During the call it may capture details and ask the listener to confirm them. When the call
ends it must judge the call and either log the outcome or raise a follow-up.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable

from anthropic import AsyncAnthropic

from convox_agora.state import Call

log = logging.getLogger(__name__)

MODEL = os.environ.get("CONVOX_AGENT_MODEL", "claude-haiku-5-5")
MAX_ROUNDS = 4  # tool round-trips per run

SYSTEM = """You are the background agent of Convox, a live interpreter between a delivery or ride \
rider and a customer who speak different languages. You never speak on the call; the \
interpreter already translates every line. You read the bilingual transcript and act through tools.

Rules:
- Only capture real details: addresses, landmarks, meeting points, flat/tower numbers, OTPs, \
times, amounts, names. Ignore small talk. Never capture the same detail twice; if a detail \
changes, capture the new value.
- Write each detail's value for the rider and for the customer in their TEXT language, in native \
script (Kannada script, Devanagari), keeping digits as digits.
- Critical details (OTP, flat number, amount, time, meeting point) must be confirmed by the \
person who did NOT say them: call confirm_detail once for each.
- If there is nothing new to do, call no tools and reply "-".
- At the end of the call, decide what the call was for and whether the two people reached an \
understanding ON the call (not what happens afterwards). Exactly one of:
  * They agreed (a place, time, number, amount or handover both accepted): log_call_outcome, \
status "resolved". Spoken acceptance ("ok", "theek hai", "sari", repeating the detail back) is \
agreement even if a tap confirmation is still pending.
  * The purpose is clear but they did NOT agree, someone refused, or a question was left open: \
create_followup. This is the common unresolved case; do not call it unclear.
  * Only when the call is too short or you cannot tell what it was for: log_call_outcome, status \
"unclear"."""

DETAIL_TYPES = ["address", "landmark", "meeting_point", "number", "otp", "time", "amount", "name"]

CAPTURE = {
    "name": "capture_detail",
    "description": "Add a structured fact said on the call to the live call card both people see.",
    "input_schema": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": DETAIL_TYPES},
            "value": {"type": "string", "description": "The detail in English, short"},
            "value_rider": {"type": "string", "description": "In the rider's text language"},
            "value_customer": {"type": "string", "description": "In the customer's text language"},
            "said_by": {"type": "string", "enum": ["rider", "customer"]},
            "critical": {"type": "boolean"},
        },
        "required": ["type", "value", "value_rider", "value_customer", "said_by", "critical"],
    },
}
CONFIRM = {
    "name": "confirm_detail",
    "description": "Ask the listener to confirm a captured critical detail (Yes/No on their phone).",
    "input_schema": {
        "type": "object",
        "properties": {
            "detail_id": {"type": "string"},
            "listener": {"type": "string", "enum": ["rider", "customer"]},
        },
        "required": ["detail_id", "listener"],
    },
}
LOG_OUTCOME = {
    "name": "log_call_outcome",
    "description": "Post the call outcome to the platform when the call reached an understanding, "
    "or when it is unclear.",
    "input_schema": {
        "type": "object",
        "properties": {
            "purpose": {"type": "string", "description": "e.g. find pickup, address, OTP, reschedule, payment"},
            "status": {"type": "string", "enum": ["resolved", "unclear"]},
            "summary": {"type": "string", "description": "One line, English"},
            "summary_rider": {"type": "string", "description": "Same, rider's text language"},
            "summary_customer": {"type": "string", "description": "Same, customer's text language"},
            "agreed_details": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["purpose", "status", "summary", "summary_rider", "summary_customer"],
    },
}
FOLLOWUP = {
    "name": "create_followup",
    "description": "Raise a follow-up for the platform when the call ended without the two people "
    "reaching an understanding.",
    "input_schema": {
        "type": "object",
        "properties": {
            "purpose": {"type": "string"},
            "reason": {"type": "string", "description": "e.g. customer unavailable, confusion, dispute"},
            "summary": {"type": "string", "description": "Two sentences, English"},
            "summary_rider": {"type": "string", "description": "Same, rider's text language"},
            "summary_customer": {"type": "string", "description": "Same, customer's text language"},
            "next_step": {"type": "string", "description": "Suggested action for the platform"},
        },
        "required": ["purpose", "reason", "summary", "summary_rider", "summary_customer", "next_step"],
    },
}

Notify = Callable[[Call, dict], Awaitable[None]]  # posts outcomes/follow-ups to the platform


def _prompt(call: Call, final: bool) -> str:
    people = {r: f"speaks {p.speak_lang}, reads {p.text_lang}" for r, p in call.people.items()}
    lines = "\n".join(
        f"{ln['n']}. {ln['speaker']}: {ln['text']}  =>  {ln['translation']}" for ln in call.lines
    )
    card = json.dumps(list(call.details.values()), ensure_ascii=False)
    tail = (
        "THE CALL HAS ENDED. First write one line: 'Verdict: resolved|unresolved|unclear - <why>'. "
        "Then call exactly one tool: resolved -> log_call_outcome(status resolved), "
        "unresolved -> create_followup, unclear -> log_call_outcome(status unclear)."
        if final else "The call is in progress."
    )
    return (
        f"People: {json.dumps(people)}\nCall purpose from platform: {call.purpose or 'unknown'}\n\n"
        f"Transcript (original => translation):\n{lines or '(empty)'}\n\n"
        f"Call card: {card}\n\n{tail}"
    )


REQUIRED = {t["name"]: t["input_schema"]["required"] for t in (CAPTURE, CONFIRM, LOG_OUTCOME, FOLLOWUP)}


async def _apply(call: Call, name: str, args: dict, notify: Notify) -> str:
    missing = [k for k in REQUIRED.get(name, []) if k not in args]
    if missing:  # check before touching the card, so a half call never lands on it
        return f"error: missing {', '.join(missing)}"
    if name == "capture_detail":
        did = f"d{len(call.details) + 1}"
        detail = {**args, "id": did, "status": "said"}
        call.details[did] = detail
        call.publish("detail", detail)
        call.add_log(f"Detail captured: {args['type']} = {args['value']}", name, args)
        return json.dumps({"detail_id": did})
    if name == "confirm_detail":
        detail = call.details.get(args["detail_id"])
        if detail is None:
            return "error: unknown detail_id"
        if detail["status"] != "said":
            return f"already {detail['status']}"
        detail.update(status="awaiting", confirm_by=args["listener"])
        call.publish("detail", detail)
        call.add_log(f"Asked {args['listener']} to confirm {detail['value']}", name, args)
        return "asked"
    if name in ("log_call_outcome", "create_followup"):
        kind = "outcome" if name == "log_call_outcome" else "followup"
        call.outcome = {"kind": kind, **args, "channel": call.channel, "t": time.time()}
        call.publish("outcome", call.outcome)
        label = f"Call {args['status']}, outcome logged" if kind == "outcome" else (
            f"Unresolved ({args['reason']}), follow-up created"
        )
        call.add_log(label, name, args)
        await notify(call, call.outcome)
        return "posted"
    return f"error: unknown tool {name}"


async def run(call: Call, client: AsyncAnthropic, notify: Notify, final: bool = False) -> None:
    tools = [LOG_OUTCOME, FOLLOWUP] if final else [CAPTURE, CONFIRM]
    messages: list[dict] = [{"role": "user", "content": _prompt(call, final)}]
    for round_ in range(MAX_ROUNDS):
        # final: reason in one line first (auto), force a tool only if it skipped one; and
        # exactly one judgment, never both outcome tools
        choice: dict = {"type": "any" if final and round_ > 0 else "auto"}
        if final:
            choice["disable_parallel_tool_use"] = True
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=2048 if final else 1024,
            system=SYSTEM,
            tools=tools,
            tool_choice=choice,
            messages=messages,
        )
        uses = [b for b in resp.content if b.type == "tool_use"]
        log.info("agent.round channel=%s final=%s stop=%s tools=%s", call.channel, final,
                 resp.stop_reason, [u.name for u in uses])
        if not uses:
            if not final:
                return
            messages.append({"role": "assistant", "content": resp.content})
            messages.append({"role": "user", "content": "Now call the matching tool."})
            continue
        messages.append({"role": "assistant", "content": resp.content})
        results = []
        for u in uses:
            try:
                out = await _apply(call, u.name, u.input, notify)
            except KeyError as e:  # model left out a required argument: tell it, don't crash
                out = f"error: missing argument {e}"
            results.append({"type": "tool_result", "tool_use_id": u.id, "content": out})
        if final:
            return  # one judgment is enough
        messages.append({"role": "user", "content": results})


def kick(call: Call, client: AsyncAnthropic, notify: Notify) -> None:
    """Schedule a background run; coalesces lines that arrive while one is in flight.
    ponytail: one run per call at a time, a dirty flag instead of a queue."""
    if call.running:
        call.dirty = True
        return

    async def loop() -> None:
        call.running = True
        try:
            while True:
                call.dirty = False
                try:
                    await run(call, client, notify)
                except Exception:
                    log.exception("agent.run_failed channel=%s", call.channel)
                if not call.dirty or call.ended:
                    return
        finally:
            call.running = False

    asyncio.create_task(loop())


async def judge(call: Call, client: AsyncAnthropic, notify: Notify) -> None:
    while call.running:  # let the in-call run finish so the card is complete
        await asyncio.sleep(0.1)
    if not call.lines:
        call.outcome = {"kind": "outcome", "purpose": call.purpose or "unknown", "status": "unclear",
                        "summary": "No speech on the call.", "channel": call.channel, "t": time.time()}
        call.publish("outcome", call.outcome)
        call.add_log("Call unclear (no speech), outcome logged", "log_call_outcome")
        await notify(call, call.outcome)
        return
    await run(call, client, notify, final=True)
