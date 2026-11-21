export const TARGET_P50_MS = 1500;
export const TARGET_P95_MS = 2000;

const LANG: Record<string, string> = {
  hi: "Hindi", kn: "Kannada", ta: "Tamil", te: "Telugu", ml: "Malayalam", mr: "Marathi",
  bn: "Bengali", gu: "Gujarati", pa: "Punjabi", od: "Odia", or: "Odia", en: "English",
};

export function langName(code: string | null | undefined): string {
  if (!code) return "";
  const k = code.split("-")[0].toLowerCase();
  return LANG[k] ?? code;
}

export function pairLabel(a: string, b: string): string {
  return `${langName(a)} ⇄ ${langName(b)}`;
}

export function fmtSecs(ms: number | null | undefined): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`;
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export function fmtMinutes(seconds: number | null | undefined): string {
  return ((seconds ?? 0) / 60).toFixed(1);
}

export function fmtDelta(v: number | null | undefined): string {
  if (v == null) return "";
  return `${v > 0 ? "+" : ""}${v}%`;
}

export type Grade = "good" | "warn" | "bad" | "none";

export function grade(ms: number | null | undefined): Grade {
  if (ms == null) return "none";
  if (ms < TARGET_P50_MS) return "good";
  return ms < TARGET_P95_MS ? "warn" : "bad";
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtInr(v: number): string {
  return `₹${v.toFixed(2)}`;
}
