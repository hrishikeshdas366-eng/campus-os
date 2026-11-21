// Campus AI — Gemini through Firebase AI Logic. Entirely opt-in; nothing is sent until you press a ✦ button.
// Unlike your synced data, text sent here is NOT end-to-end encrypted (Google's Gemini has to read it to answer).
import { firebaseConfig } from "./firebase-config.js";
import { today, addDays, daysBetween, weekday, DAYS_LONG, fmtTime, toast } from "./ui.js";
import { classesOn, subjectStats } from "./calc.js";
import * as sync from "./sync.js";

const SDK = "https://www.gstatic.com/firebasejs/11.10.0/";
// Fast "lite" model first (answers in ~1-2 s); the full flash model is only a fallback. Aliases track Google's newest versions.
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const TIMEOUT_MS = 40000;
const KEY = "campusos:ai";

export const aiOn = () => { try { return localStorage.getItem(KEY) === "on"; } catch (_) { return false; } };
export const setAi = on => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) { /* ignore */ } };
export const aiAvailable = () => !!firebaseConfig;

let ai = null, modelName = null;

async function load() {
  if (ai) return ai;
  const [appM, aiM] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-ai.js")]);
  const app = appM.getApps().find(a => a.name === "campus-ai") || appM.initializeApp(firebaseConfig, "campus-ai");
  ai = { M: aiM, inst: aiM.getAI(app, { backend: new aiM.GoogleAIBackend() }) };
  return ai;
}

function friendly(e) {
  const m = String((e && (e.message || e.code)) || e);
  if (/429|quota|rate|exhaust|too many/i.test(m)) return "Campus AI is busy right now (the free limit was reached). Try again in a minute.";
  if (/api-not-enabled|API.{0,40}enabled|api.?key|permission|403|disabled|has not been used/i.test(m)) return "The AI service isn't switched on for this app yet.";
  if (/timed out/i.test(m)) return "The AI is taking too long. Try again in a moment.";
  if (/network|fetch|offline|Failed to/i.test(m)) return "Couldn't reach the AI. Check your internet connection.";
  if (/safety|blocked/i.test(m)) return "The AI declined to answer that one. Try rephrasing.";
  return "The AI hit a problem: " + m.slice(0, 160);
}

/** Low-level call (no consent checks — callers must use ensureReady() first). Returns text. */
export async function generate(prompt, o) {
  o = o || {};
  const { M, inst } = await load();
  const order = modelName ? [modelName].concat(MODELS.filter(x => x !== modelName)) : MODELS;
  let lastErr;
  for (const name of order) {
    try {
      const model = M.getGenerativeModel(inst, {
        model: name,
        systemInstruction: o.system || undefined,
        generationConfig: Object.assign({ temperature: 0.6, maxOutputTokens: 2048 }, o.json ? { responseMimeType: "application/json" } : {}),
      });
      const res = await Promise.race([model.generateContent(prompt), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out — the AI took too long")), TIMEOUT_MS))]);
      modelName = name;
      return res.response.text();
    } catch (e) {
      lastErr = e;
      const m = String((e && e.message) || e);
      if (/not found|404|unsupported|no longer available|deprecated/i.test(m)) continue;   // try the next model name
      break;
    }
  }
  const err = new Error(friendly(lastErr)); err.cause = lastErr; throw err;
}

export async function generateJSON(prompt, o) {
  const t = await generate(prompt, Object.assign({}, o, { json: true }));
  try { return JSON.parse(t); } catch (_) {
    const m = t.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch (__) { /* fall through */ } }
    throw new Error("The AI's answer wasn't in the expected format. Try again.");
  }
}

// ---------- consent + sign-in gate ----------
export function consent() {
  return new Promise(resolve => {
    const dlg = document.getElementById("dlg");
    dlg.innerHTML = '<form method="dialog"><div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">Campus AI</p><h2 class="h-md">Before you use the AI</h2></div>' +
      '<button type="button" class="btn sm icon ghost" data-no aria-label="Close">✕</button></div>' +
      '<div class="muted" style="display:grid;gap:12px;font-size:14px">' +
      "<p style=\"margin:0\">Campus AI uses Google's <b>Gemini</b> to summarise notes, plan revision and answer questions about your week.</p>" +
      "<p style=\"margin:0\"><b>What's different from the rest of the app:</b> your synced data is end-to-end encrypted so even we can't read it — but to answer, Gemini has to read whatever you send it. Text goes to Google only when <b>you press a ✦ button</b>, and only what that button says it sends (never your name, college or spending).</p>" +
      "<p style=\"margin:0\">Answers can be wrong. Treat them as suggestions — and don't send anything private you wouldn't want Google to process.</p></div>" +
      '<div class="dlg-foot"><button type="button" class="btn sm ghost" data-no>Not now</button><button type="button" class="btn sm solid" data-yes>I understand — turn on</button></div></form>';
    let done = false;
    const fin = v => { if (done) return; done = true; dlg.close(); resolve(v); };
    dlg.querySelectorAll("[data-no]").forEach(b => (b.onclick = () => fin(false)));
    dlg.querySelector("[data-yes]").onclick = () => fin(true);
    dlg.addEventListener("close", () => fin(false), { once: true });
    dlg.showModal();
  });
}

/** Consent + Google sign-in. Resolves true when the AI may be used right now. */
export async function ensureReady() {
  if (!aiAvailable()) { toast("AI isn't available in this copy of the app", { error: true }); return false; }
  if (!aiOn()) {
    if (!(await consent())) return false;
    setAi(true);
  }
  if (!sync.S.user) {
    toast("Sign in with Google to use Campus AI");
    await sync.signIn();
    if (!sync.S.user) return false;
  }
  return true;
}

// ---------- what gets sent for "Ask" ----------
/** A compact, anonymous snapshot of the week — no name, college, notes or money. */
export function buildContext(d) {
  const t = today();
  const subs = d.subjects.filter(s => !s.archived).map(s => {
    const st = subjectStats(d, s);
    return { subject: s.name, attended: st.present, missed: st.absent, percent: st.percent == null ? null : Math.round(st.percent * 10) / 10, target: st.target, canStillMiss: st.ok ? st.canSkip : 0, mustAttendInARow: st.ok ? 0 : st.need };
  });
  const week = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(t, i);
    const cl = classesOn(d, ds).map(c => ({ subject: (d.subjects.find(s => s.id === c.subjectId) || {}).name, time: fmtTime(c.start) + (c.end ? "-" + fmtTime(c.end) : "") }));
    if (cl.length) week.push({ date: ds, day: DAYS_LONG[weekday(ds)], classes: cl });
  }
  const tasks = d.tasks.filter(x => !x.done).sort((a, b) => (a.due || "9").localeCompare(b.due || "9")).slice(0, 15)
    .map(x => ({ title: x.title, due: x.due || null, priority: x.priority, subject: (d.subjects.find(s => s.id === x.subjectId) || {}).name || null }));
  const exams = d.exams.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
    .map(e => ({ subject: (d.subjects.find(s => s.id === e.subjectId) || {}).name || e.title, date: e.date, inDays: daysBetween(t, e.date) }));
  return { today: t, todayIs: DAYS_LONG[weekday(t)], attendanceTargetPercent: Number(d.profile.target || 75), subjects: subs, classesThisWeek: week, openTasks: tasks, upcomingExams: exams };
}

export const SYSTEM = "You are Campus AI, a friendly, concise study-and-attendance assistant inside a college student's planner app. " +
  "Use ONLY the JSON data provided for facts about the student's attendance, classes, tasks and exams — never invent numbers. " +
  "Attendance 'canStillMiss' means how many more classes the student can miss in that subject and still meet the target. " +
  "Give practical, specific advice in short paragraphs or bullets (max ~150 words unless asked for a plan). Remind them college rules decide when it matters. Do not use markdown headings.";

export async function ask(question, d) {
  const prompt = "STUDENT DATA (JSON):\n" + JSON.stringify(buildContext(d)) + "\n\nQUESTION: " + question;
  return generate(prompt, { system: SYSTEM });
}

export async function summarise(title, body) {
  return generate("Summarise these study notes for quick revision. Give: 1) a 2-sentence overview, 2) 4-8 key points as short bullets starting with '- ', 3) up to 3 likely exam questions starting with '? '. Be faithful to the text; do not add outside facts.\n\nTITLE: " + title + "\n\nNOTES:\n" + body.slice(0, 12000),
    { system: "You are a precise study assistant. Plain text only, no markdown headings." });
}

export async function revisionPlan({ subject, syllabus, examDate, hoursPerDay }) {
  const t = today(), days = Math.max(1, daysBetween(t, examDate));
  const prompt = "Create a day-by-day revision plan.\nSubject: " + subject + "\nToday: " + t + "\nExam date: " + examDate + " (" + days + " day(s) away)\nStudy time available per day: " + hoursPerDay + " hours\nSyllabus / topics:\n" + (syllabus || "(not provided — infer the usual core topics of this subject)").slice(0, 6000) +
    "\n\nReturn JSON: an array of at most " + Math.min(days, 21) + " objects {\"date\":\"YYYY-MM-DD\",\"title\":\"short task title\",\"detail\":\"what exactly to study, 1 sentence\"} — one per study day from today up to the day before the exam, spreading topics sensibly, with the last 1-2 days for revision and past papers. Dates must be between " + t + " and " + addDays(examDate, -1) + " inclusive.";
  const arr = await generateJSON(prompt, { system: "You are a careful study planner. Output only JSON." });
  const list = Array.isArray(arr) ? arr : Array.isArray(arr.plan) ? arr.plan : [];
  return list.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) && x.title)
    .map(x => ({ date: x.date < t ? t : x.date >= examDate ? addDays(examDate, -1) : x.date, title: String(x.title).slice(0, 80), detail: String(x.detail || "").slice(0, 200) }))
    .slice(0, 30);
}

