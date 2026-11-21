"""In-memory call state, keyed by Agora channel. ponytail: lost on restart; a demo runs on one box."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

ROLES = ("rider", "customer")
# Numeric uids so the Web SDK and the agents agree. A human's agent is the one that SPEAKS to them.
HUMAN_UID = {"rider": "101", "customer": "102"}
AGENT_UID = {"rider": "201", "customer": "202"}


@dataclass
class Person:
    role: str
    speak_lang: str  # e.g. "kn-IN"
    text_lang: str  # what the call card shows them; may differ (e.g. speaks Hindi, reads English)
    gender: str | None = None  # "m"/"f": Hindi/Marathi verbs agree with the speaker


@dataclass
class Call:
    channel: str
    people: dict[str, Person]
    purpose: str | None = None
    lines: list[dict] = field(default_factory=list)
    details: dict[str, dict] = field(default_factory=dict)
    log: list[dict] = field(default_factory=list)
    outcome: dict | None = None
    agent_ids: dict[str, str] = field(default_factory=dict)  # listener role -> Agora agent id
    links: dict[str, str] = field(default_factory=dict)  # role -> phone URL
    joined: dict[str, bool] = field(default_factory=dict)  # role -> that phone is in the channel
    ended: bool = False
    ai_role: str | None = None  # /demo: this side is played by Claude (persona.py)
    story: str | None = None  # /demo: key into persona.STORIES
    created_at: float = field(default_factory=time.time)
    subs: set[asyncio.Queue] = field(default_factory=set)
    running: bool = False  # a Claude run is in flight
    dirty: bool = False  # new lines arrived during that run

    def other(self, role: str) -> Person:
        return self.people["customer" if role == "rider" else "rider"]

    def publish(self, kind: str, data: dict) -> None:
        for q in self.subs:
            q.put_nowait({"kind": kind, "data": data})

    def add_log(self, text: str, tool: str | None = None, args: dict | None = None) -> None:
        entry = {"t": time.time(), "text": text, "tool": tool, "args": args}
        self.log.append(entry)
        self.publish("log", entry)

    def add_line(self, speaker: str, text: str, translation: str, latency_ms: int) -> dict:
        line = {
            "n": len(self.lines) + 1,
            "speaker": speaker,
            "text": text,
            "translation": translation,
            "latency_ms": latency_ms,
            "t": time.time(),
        }
        self.lines.append(line)
        self.publish("line", line)
        return line

    @classmethod
    def from_snapshot(cls, d: dict) -> "Call":
        """A call in progress, restored after a restart (its Agora agents are still running)."""
        return cls(channel=d["channel"], people={r: Person(**p) for r, p in d["people"].items()},
                   purpose=d.get("purpose"), lines=d["lines"], log=d["log"], outcome=d.get("outcome"),
                   details={x["id"]: x for x in d["details"]}, agent_ids=d.get("agent_ids", {}),
                   links=d.get("links", {}), joined=d.get("joined", {}), ended=d.get("ended", False),
                   ai_role=d.get("ai_role"), story=d.get("story"), created_at=d.get("created_at", time.time()))

    def snapshot(self) -> dict:
        return {
            "channel": self.channel,
            "created_at": self.created_at,
            "people": {r: vars(p) for r, p in self.people.items()},
            "purpose": self.purpose,
            "lines": self.lines,
            "details": list(self.details.values()),
            "log": self.log,
            "outcome": self.outcome,
            "ended": self.ended,
            "links": self.links,
            "ai_role": self.ai_role,
            "story": self.story,
            "joined": self.joined,
            "agent_ids": self.agent_ids,
        }


CALLS: dict[str, Call] = {}
