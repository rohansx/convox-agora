"""The /demo's other person: Claude playing a rider or delivery agent who speaks only their language.

It never sees the human's own words, only what the interpreter gave it in its language, and it
answers in that language; Convox translates the answer back like any other line.
"""

from __future__ import annotations

import os

from anthropic import AsyncAnthropic

from convox_agora.state import Call

MODEL = os.environ.get("CONVOX_PERSONA_MODEL", "claude-haiku-5-5")

STORIES: dict[str, dict] = {
    "pickup": {
        "title": "Ride pickup",
        "headline": "Your bike rider can't find you.",
        "stakes": "Ravi is near the metro station and can't see you. Tell him where you are, and give him the OTP when he asks.",
        "purpose": "find pickup",
        "name": "Ravi",
        "role": "bike rider",
        "gender": "m",
        "brief": "You are Ravi, a bike-taxi rider in Bengaluru. You reached the pickup pin near the metro "
        "station but cannot see the customer. Find out exactly where they are (which gate, landmark), "
        "repeat it back to confirm, say how many minutes you need, and ask for the ride OTP. "
        "Once you have the place and the OTP, say you are coming and say goodbye.",
        "greeting": {
            "kn-IN": "ನಮಸ್ಕಾರ, ನಾನು ರವಿ, ನಿಮ್ಮ ಬೈಕ್ ರೈಡರ್. ನಾನು ಮೆಟ್ರೋ ಸ್ಟೇಷನ್ ಹತ್ರ ಇದ್ದೀನಿ, ನೀವು ಎಲ್ಲಿ ಇದ್ದೀರಾ?",
            "hi-IN": "नमस्ते, मैं रवि, आपका बाइक राइडर। मैं मेट्रो स्टेशन के पास हूँ, आप कहाँ हैं?",
        },
    },
    "parcel": {
        "title": "Parcel delivery",
        "headline": "Your parcel is at the door. You aren't.",
        "stakes": "Suresh has your cash-on-delivery parcel (₹499) and nobody is home. Agree on a time, or who can take it.",
        "purpose": "parcel delivery",
        "name": "Suresh",
        "role": "delivery agent",
        "gender": "m",
        "brief": "You are Suresh, a parcel delivery agent in Bengaluru. You are at the customer's door with a "
        "cash-on-delivery parcel of 499 rupees and nobody answers. Ask if they are home. If not, try to "
        "agree on one of: leave it with a neighbour or security (who collects the cash?), or a new time. "
        "You can come back today only before 6 PM, otherwise tomorrow morning. If you agree, repeat the "
        "arrangement back. If they insist on something you cannot do, politely say you will mark it as "
        "a reattempt.",
        "greeting": {
            "kn-IN": "ನಮಸ್ಕಾರ, ನಾನು ಸುರೇಶ್, ಡೆಲಿವರಿ ಇಂದ. ನಿಮ್ಮ ಪಾರ್ಸೆಲ್ ಇದೆ, ನಾನು ನಿಮ್ಮ ಮನೆ ಬಾಗಿಲ ಹತ್ರ ಇದ್ದೀನಿ.",
            "hi-IN": "नमस्ते, मैं सुरेश, डिलीवरी से। आपका पार्सल है, मैं आपके घर के दरवाज़े पर हूँ।",
        },
    },
}

LANG_NAMES = {"kn-IN": "Kannada", "hi-IN": "Hindi", "mr-IN": "Marathi", "ml-IN": "Malayalam", "en-IN": "English",
              "ta-IN": "Tamil", "te-IN": "Telugu"}

RULES = """How you talk (this matters most):
- Speak ONLY {lang}, colloquial, like a busy rider on a phone call. Native script for Indian languages.
- ONE short sentence, at most 12 words. Often less: "Okay, coming." "Which gate?" "OTP tell me."
- Never recap the whole conversation. Repeat back only the one new detail you just heard, once.
- No greetings after the first line, no "thank you for the information", no explanations.
- Numbers as digits (OTP 4729, 499 rupees, 7 PM).
- You only know what the interpreter gave you below; if it's unclear, ask one short question.
- When you have what you need, say a 3-5 word goodbye and stop.
- Never say you are an AI unless asked directly."""


async def reply(call: Call, client: AsyncAnthropic) -> str:
    """The persona's next line, in its own language."""
    ai = call.people[call.ai_role]
    story = STORIES[call.story]
    lang = LANG_NAMES.get(ai.speak_lang, ai.speak_lang)
    # what the persona has heard: its own lines as said, the customer's as translated for it
    convo = []
    for ln in call.lines:
        if ln["speaker"] == call.ai_role:
            convo.append({"role": "assistant", "content": ln["text"]})
        elif ln["speaker"] != "system" and ln["translation"]:
            convo.append({"role": "user", "content": ln["translation"]})
    merged: list[dict] = []
    for m in convo:  # the API wants alternating turns
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n" + m["content"]
        else:
            merged.append(dict(m))
    convo = merged
    if not convo or convo[0]["role"] != "user":
        convo.insert(0, {"role": "user", "content": "(the call connects)"})
    resp = await client.messages.create(
        model=MODEL,
        max_tokens=300,
        system=f"{story['brief']}\n\n{RULES.format(lang=lang)}",
        messages=convo,
    )
    return "".join(b.text for b in resp.content if b.type == "text").strip()
