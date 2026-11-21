/** Sample calls for the dashboard's "Demo data" switch: a believable week of a fleet's calls,
 * generated in the browser from a few scripted scenarios. Never sent to or stored by the backend. */
import type { Call, Detail, LogEntry, Outcome } from "@/lib/data";

type Side = "rider" | "customer";
interface Scenario {
  purpose: string;
  rider: string; customer: string;
  lines: [Side, string, string][];             // speaker, said, heard
  details: Omit<Detail, "id" | "status">[];
  confirmed: boolean;                          // the listener tapped yes
  outcome: Omit<Outcome, "channel" | "t" | "kind"> & { kind: "outcome" | "followup" };
}

const S: Scenario[] = [
  {
    purpose: "find pickup", rider: "kn-IN", customer: "hi-IN", confirmed: true,
    lines: [
      ["rider", "ನಮಸ್ಕಾರ ಮೇಡಂ, ನೀವು ಎಲ್ಲಿ ಇದ್ದೀರಾ?", "नमस्ते मैडम, आप कहाँ हैं?"],
      ["customer", "मैं मेट्रो स्टेशन के गेट नंबर 2 पे खड़ी हूँ", "ನಾನು ಮೆಟ್ರೋ ಸ್ಟೇಷನ್ ಗೇಟ್ ನಂಬರ್ 2 ಹತ್ರ ನಿಂತಿದ್ದೀನಿ"],
      ["rider", "ಸರಿ, ಗೇಟ್ 2. ಐದು ನಿಮಿಷದಲ್ಲಿ ಬರ್ತೀನಿ", "ठीक है, गेट 2. पाँच मिनट में आता हूँ"],
      ["customer", "ठीक है, OTP 4729 है", "ಸರಿ, OTP 4729"],
    ],
    details: [
      { type: "meeting_point", value: "Metro station, gate 2", value_rider: "ಮೆಟ್ರೋ ಸ್ಟೇಷನ್, ಗೇಟ್ 2", value_customer: "मेट्रो स्टेशन, गेट 2", said_by: "customer", critical: true, confirm_by: "rider" },
      { type: "otp", value: "4729", value_rider: "4729", value_customer: "4729", said_by: "customer", critical: true, confirm_by: "rider" },
    ],
    outcome: { kind: "outcome", purpose: "find pickup", status: "resolved", summary: "Customer is at metro station gate 2; rider confirmed and is 5 minutes away. OTP 4729 shared.", agreed_details: ["Meeting point: metro station gate 2", "OTP 4729"] },
  },
  {
    purpose: "parcel delivery", rider: "kn-IN", customer: "hi-IN", confirmed: false,
    lines: [
      ["rider", "ನಿಮ್ಮ ಪಾರ್ಸೆಲ್ ಇದೆ, ಎಲ್ಲಿ ಡೆಲಿವರಿ ಮಾಡಬೇಕು?", "आपका पार्सल है, कहाँ डिलीवर करूँ?"],
      ["customer", "मैं अभी घर पे नहीं हूँ, शाम 7 बजे के बाद आइए", "ನಾನು ಈಗ ಮನೆಯಲ್ಲಿ ಇಲ್ಲ, ಸಂಜೆ 7 ಗಂಟೆ ನಂತರ ಬನ್ನಿ"],
      ["rider", "7 ಗಂಟೆಗೆ ಆಗಲ್ಲ, ಪಕ್ಕದ ಮನೆಯಲ್ಲಿ ಕೊಡಲಾ?", "7 बजे नहीं हो पाएगा, पड़ोसी को दे दूँ?"],
      ["customer", "नहीं, पड़ोसी को मत देना", "ಬೇಡ, ಪಕ್ಕದ ಮನೆಗೆ ಕೊಡಬೇಡಿ"],
    ],
    details: [
      { type: "time", value: "After 7 PM", value_rider: "ಸಂಜೆ 7 ನಂತರ", value_customer: "शाम 7 बजे के बाद", said_by: "customer", critical: true, confirm_by: "rider" },
    ],
    outcome: { kind: "followup", purpose: "parcel delivery", reason: "customer unavailable", summary: "Customer is not home and asked for delivery after 7 PM; rider cannot come then and the customer refused a neighbour handover. No agreement.", next_step: "Reattempt after 7 PM with a rider whose shift covers it, or offer a pickup point." },
  },
  {
    purpose: "share OTP", rider: "kn-IN", customer: "en-IN", confirmed: true,
    lines: [
      ["rider", "ಮೇಡಂ, ಡೆಲಿವರಿಗೆ OTP ಹೇಳಿ", "Madam, please tell me the OTP for the delivery"],
      ["customer", "The OTP is 8351", "OTP 8351"],
      ["rider", "8351, ಸರಿ ತಾನೇ?", "8351, is that right?"],
      ["customer", "Yes, correct", "ಹೌದು, ಸರಿ"],
    ],
    details: [{ type: "otp", value: "8351", value_rider: "8351", value_customer: "8351", said_by: "customer", critical: true, confirm_by: "rider" }],
    outcome: { kind: "outcome", purpose: "share OTP", status: "resolved", summary: "Customer shared delivery OTP 8351; rider read it back and the customer confirmed.", agreed_details: ["OTP 8351"] },
  },
  {
    purpose: "address", rider: "hi-IN", customer: "kn-IN", confirmed: true,
    lines: [
      ["rider", "मैं सोसाइटी के गेट पे हूँ, कौन सा टावर?", "ನಾನು ಸೊಸೈಟಿ ಗೇಟ್ ಹತ್ರ ಇದ್ದೀನಿ, ಯಾವ ಟವರ್?"],
      ["customer", "ಟವರ್ B, ಫ್ಲಾಟ್ 402, ಲಿಫ್ಟ್ ಪಕ್ಕ", "टावर B, फ्लैट 402, लिफ्ट के पास"],
      ["rider", "टावर B, 402, ठीक है", "ಟವರ್ B, 402, ಸರಿ"],
    ],
    details: [{ type: "address", value: "Tower B, flat 402, next to the lift", value_rider: "टावर B, फ्लैट 402", value_customer: "ಟವರ್ B, ಫ್ಲಾಟ್ 402", said_by: "customer", critical: true, confirm_by: "rider" }],
    outcome: { kind: "outcome", purpose: "address", status: "resolved", summary: "Rider got the tower and flat (Tower B, flat 402) and confirmed it.", agreed_details: ["Tower B, flat 402"] },
  },
  {
    purpose: "payment", rider: "kn-IN", customer: "ta-IN", confirmed: false,
    lines: [
      ["rider", "ಕ್ಯಾಶ್ ಆನ್ ಡೆಲಿವರಿ, 499 ರೂಪಾಯಿ", "கேஷ் ஆன் டெலிவரி, 499 ரூபாய்"],
      ["customer", "நான் ஏற்கனவே ஆன்லைனில் கட்டிவிட்டேன்", "ನಾನು ಈಗಾಗಲೇ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಕಟ್ಟಿದ್ದೀನಿ"],
      ["rider", "ಆದ್ರೆ ನನ್ನ ಆಪ್‌ನಲ್ಲಿ COD ತೋರಿಸ್ತಿದೆ", "ஆனால் என் ஆப்பில் COD காட்டுகிறது"],
    ],
    details: [{ type: "amount", value: "₹499 COD", value_rider: "₹499", value_customer: "₹499", said_by: "rider", critical: true, confirm_by: "customer" }],
    outcome: { kind: "followup", purpose: "payment", reason: "dispute", summary: "Rider's app shows ₹499 cash on delivery; customer says it was already paid online. Not settled on the call.", next_step: "Check the payment status and update the order before the rider retries." },
  },
  {
    purpose: "find pickup", rider: "kn-IN", customer: "hi-IN", confirmed: false,
    lines: [["rider", "ಹಲೋ, ಕೇಳಿಸ್ತಿದೆಯಾ?", "हैलो, सुनाई दे रहा है?"]],
    details: [],
    outcome: { kind: "outcome", purpose: "find pickup", status: "unclear", summary: "Call dropped after the greeting; nothing to judge." },
  },
];
const WEIGHTS = [10, 5, 7, 6, 3, 2]; // how often each scenario happens

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

function build(): Call[] {
  const rand = rng(42);
  const now = Date.now() / 1000;
  const pool = S.flatMap((s, i) => Array(WEIGHTS[i]).fill(s) as Scenario[]);
  const calls: Call[] = [];
  for (let k = 0; k < 42; k++) {
    const s = pool[Math.floor(rand() * pool.length)];
    const start = now - 3600 * (1 + k * 3.7 + rand() * 2);
    let t = start + 3;
    const lines = s.lines.map(([speaker, text, translation], n) => {
      t += 4 + rand() * 6;
      return { n: n + 1, speaker, text, translation, latency_ms: Math.round(650 + rand() * 1500), t };
    });
    const log: LogEntry[] = [{ t: start, text: "Context loaded", tool: "get_call_context", args: null }];
    const details: Detail[] = s.details.map((d, i) => {
      const at = lines[Math.min(lines.length - 1, i + 1)].t + 1;
      const id = `d${i + 1}`;
      log.push({ t: at, text: `Detail captured: ${d.type} = ${d.value}`, tool: "capture_detail", args: { type: d.type, value: d.value, said_by: d.said_by, critical: d.critical } });
      if (d.critical) log.push({ t: at + 1, text: `Asked ${d.confirm_by} to confirm ${d.value}`, tool: "confirm_detail", args: { detail_id: id, listener: d.confirm_by ?? "" } });
      return { ...d, id, status: d.critical ? (s.confirmed ? "confirmed" : "awaiting") : "said" };
    });
    const end = t + 5;
    const tool = s.outcome.kind === "followup" ? "create_followup" : "log_call_outcome";
    log.push({ t: end, text: "Call ended", tool: null, args: null });
    log.push({
      t: end + 2, tool, args: { ...s.outcome } as Record<string, unknown>,
      text: s.outcome.kind === "followup" ? `Unresolved (${s.outcome.reason}), follow-up created` : `Call ${s.outcome.status}, outcome logged`,
    });
    const channel = `demo${(1000 + k).toString(36)}`;
    calls.push({
      channel, created_at: start, purpose: s.purpose, lines, details, log, ended: true, ai_role: null, story: null,
      people: {
        rider: { role: "rider", speak_lang: s.rider, text_lang: s.rider, gender: "m" },
        customer: { role: "customer", speak_lang: s.customer, text_lang: s.customer, gender: "f" },
      },
      outcome: { ...s.outcome, channel, t: end + 2 } as Outcome,
    });
  }
  return calls;
}

export const DEMO_CALLS: Call[] = build();
export const isDemoChannel = (ch: string) => ch.startsWith("demo");
