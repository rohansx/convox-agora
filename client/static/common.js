// Shared by the host (laptop/projector) and phone pages.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LANGS = {
  "kn-IN": { native: "ಕನ್ನಡ", english: "Kannada" },
  "hi-IN": { native: "हिन्दी", english: "Hindi" },
  "ta-IN": { native: "தமிழ்", english: "Tamil" },
  "te-IN": { native: "తెలుగు", english: "Telugu" },
  "mr-IN": { native: "मराठी", english: "Marathi" },
  "gu-IN": { native: "ગુજરાતી", english: "Gujarati" },
  "bn-IN": { native: "বাংলা", english: "Bengali" },
  "ml-IN": { native: "മലയാളം", english: "Malayalam" },
  "en-IN": { native: "English", english: "English" },
};
const lang = code => LANGS[code] || { native: code, english: code };

// The few words a person reads mid-call, in their own text language.
const UI = {
  "kn-IN": { start: "ಪ್ರಾರಂಭಿಸಿ", leave: "ಕರೆ ಮುಗಿಸಿ", card: "ಕರೆ ವಿವರಗಳು", confirm: "ಸರಿಯೇ?",
             yes: "ಹೌದು", no: "ಇಲ್ಲ", listening: "ಕೇಳುತ್ತಿದೆ", speaking: "ಮಾತನಾಡುತ್ತಿದೆ" },
  "hi-IN": { start: "शुरू करें", leave: "कॉल खत्म करें", card: "कॉल की जानकारी", confirm: "सही है?",
             yes: "हाँ", no: "नहीं", listening: "सुन रहा है", speaking: "बोल रहा है" },
  "mr-IN": { start: "सुरू करा", leave: "कॉल संपवा", card: "कॉलची माहिती", confirm: "बरोबर आहे?",
             yes: "हो", no: "नाही", listening: "ऐकत आहे", speaking: "बोलत आहे" },
  "ml-IN": { start: "തുടങ്ങുക", leave: "കോൾ അവസാനിപ്പിക്കുക", card: "കോൾ വിവരങ്ങൾ", confirm: "ശരിയാണോ?",
             yes: "അതെ", no: "അല്ല", listening: "കേൾക്കുന്നു", speaking: "സംസാരിക്കുന്നു" },
  "en-IN": { start: "Start", leave: "End call", card: "Call details", confirm: "Correct?",
             yes: "Yes", no: "No", listening: "Listening", speaking: "Speaking" },
};
const ui = code => UI[code] || UI["en-IN"];

const LOGO = `<a class="logo" href="/" aria-label="Convox AI"><svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="3.2" y="11" width="2.8" height="10" rx="1.4" fill="currentColor"/><rect x="7.6" y="7" width="2.8" height="18" rx="1.4" fill="currentColor"/><rect x="12" y="3" width="2.8" height="26" rx="1.4" fill="currentColor"/><rect x="16.4" y="3" width="2.8" height="26" rx="1.4" fill="#ff5b14"/><rect x="20.8" y="7" width="2.8" height="18" rx="1.4" fill="#ff5b14"/><rect x="25.2" y="11" width="2.8" height="10" rx="1.4" fill="#ff5b14"/></svg><span class="word">CONVOX<em>AI</em></span></a>`;

const api = (path, body) => fetch(path, body === undefined ? {} : {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); });

// One detail on the call card. `role` decides which language the value is shown in and
// whether this viewer gets the Yes/No buttons.
function detailHTML(d, role, textLang) {
  const value = role === "rider" ? d.value_rider : role === "customer" ? d.value_customer : null;
  const asks = role && d.status === "awaiting" && d.confirm_by === role;
  const t = ui(textLang);
  return `<div class="detail">
    <div class="detail-top"><span class="detail-k">${esc(d.type.replace("_", " "))} · ${esc(d.said_by)}</span>
      <span class="st ${esc(d.status)}">${esc(d.status)}${d.status === "awaiting" ? ` · ${esc(d.confirm_by)}` : ""}</span></div>
    <p class="detail-v">${esc(value || d.value)}</p>
    ${value && value !== d.value ? `<p class="detail-en">${esc(d.value)}</p>` : ""}
    ${!role ? `<p class="detail-en">${esc(d.value_rider)} · ${esc(d.value_customer)}</p>` : ""}
    ${asks ? `<div class="confirm"><span>${esc(t.confirm)}</span>
      <button class="yes" data-id="${esc(d.id)}" data-yes="1">${esc(t.yes)}</button>
      <button class="no" data-id="${esc(d.id)}" data-yes="0">${esc(t.no)}</button></div>` : ""}
  </div>`;
}

function outcomeHTML(o, role) {
  if (!o) return "";
  if (o.kind === "followup") {
    const local = null;  // the judgment is English, for the platform
    return `<div class="outcome follow"><b>Not resolved · follow-up raised</b>${esc(o.reason)}
      <p>${esc(local || o.summary)}</p><p><strong>Next step:</strong> ${esc(o.next_step)}</p></div>`;
  }
  const cls = o.status === "resolved" ? "ok" : "unclear";
  return `<div class="outcome ${cls}"><b>Call ${esc(o.status)} · outcome logged</b>${esc(o.purpose)}
    <p>${esc(o.summary)}</p></div>`;
}

function logHTML(log) {
  return log.map(e => `<div class="log-row"><span class="log-t">${new Date(e.t * 1000)
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
    <span>${e.tool ? `<span class="tool">${esc(e.tool)}</span>` : ""}${esc(e.text)}</span></div>`).join("");
}

// Live call state from the backend's SSE stream; calls render() after every change.
function subscribe(ch, state, render) {
  const es = new EventSource(`/calls/${encodeURIComponent(ch)}/events`);
  es.addEventListener("snapshot", e => {
    const s = JSON.parse(e.data);
    Object.assign(state, { lines: s.lines, log: s.log, outcome: s.outcome, ended: s.ended,
      details: Object.fromEntries(s.details.map(d => [d.id, d])) });
    render();
  });
  es.addEventListener("line", e => { state.lines.push(JSON.parse(e.data)); render(); });
  es.addEventListener("detail", e => { const d = JSON.parse(e.data); state.details[d.id] = d; render(); });
  es.addEventListener("log", e => { state.log.push(JSON.parse(e.data)); render(); });
  es.addEventListener("outcome", e => { state.outcome = JSON.parse(e.data); render(); });
  es.addEventListener("ended", () => { state.ended = true; render(); });
  return es;
}

const latClass = ms => ms < 1200 ? "lat-good" : ms < 2000 ? "lat-warn" : "lat-bad";
