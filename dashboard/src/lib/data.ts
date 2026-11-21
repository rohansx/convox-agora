/** Every call, live and archived, from the backend's /dashboard/data (polled). */
import { useEffect, useState } from "react";

export interface Person { role: string; speak_lang: string; text_lang: string; gender: string | null }
export interface Line { n: number; speaker: string; text: string; translation: string; latency_ms: number; t: number }
export interface Detail {
  id: string; type: string; value: string; value_rider: string; value_customer: string;
  said_by: string; critical: boolean; status: string; confirm_by?: string;
}
export interface LogEntry { t: number; text: string; tool: string | null; args: Record<string, unknown> | null }
export interface Outcome {
  kind: "outcome" | "followup"; purpose: string; status?: "resolved" | "unclear"; summary: string;
  summary_rider?: string; summary_customer?: string; agreed_details?: string[];
  reason?: string; next_step?: string; channel: string; t: number;
}
export interface Call {
  channel: string; created_at: number; people: Record<"rider" | "customer", Person>; purpose: string | null;
  lines: Line[]; details: Detail[]; log: LogEntry[]; outcome: Outcome | null; ended: boolean;
  ai_role: string | null; story: string | null;
}

export type Verdict = "live" | "resolved" | "follow-up" | "unclear" | "ended";

export function verdict(c: Call): Verdict {
  if (!c.ended) return "live";
  if (!c.outcome) return "ended";
  if (c.outcome.kind === "followup") return "follow-up";
  return c.outcome.status === "resolved" ? "resolved" : "unclear";
}

export const LANG: Record<string, string> = {
  "kn-IN": "Kannada", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu", "mr-IN": "Marathi",
  "ml-IN": "Malayalam", "gu-IN": "Gujarati", "bn-IN": "Bengali", "en-IN": "English",
};
export const lang = (c: string) => LANG[c] ?? c;
export const pair = (c: Call) => `${lang(c.people.rider.speak_lang)} ⇄ ${lang(c.people.customer.speak_lang)}`;
export const turns = (c: Call) => c.lines.filter((l) => l.speaker !== "system");
export const toolCalls = (c: Call) => c.log.filter((e) => e.tool && e.tool !== "get_call_context");

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
}
export const secs = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);
export const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const hms = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const openCall = (ch: string) => { window.location.href = `/app/calls/${encodeURIComponent(ch)}`; };

/** All calls, newest first, refreshed every 3 s. */
export function useCalls() {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/dashboard/data", { headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Call[];
        if (alive) { setCalls(data); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return { calls, error };
}
