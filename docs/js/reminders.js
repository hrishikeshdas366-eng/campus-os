// In-app reminders: class starting, "mark your attendance", morning digest.
// Browsers can only run these while Campus OS is open (or running in the background on a computer / installed app).
// For alerts that fire even when the app is closed, use the calendar export (ics.js).
import { today, addDays, nowMinutes, toMin, fmtTime, plural, daysBetween } from "./ui.js";
import { classesOn } from "./calc.js";

const PREF = "campusos:remind", SEEN = "campusos:notified";
const DEFAULTS = { on: false, lead: 10, markAfter: true, digest: true };

export function prefs() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(PREF) || "{}")); } catch (_) { return Object.assign({}, DEFAULTS); }
}
export function setPrefs(p) {
  try { localStorage.setItem(PREF, JSON.stringify(Object.assign(prefs(), p))); } catch (_) { /* ignore */ }
}
export const supported = () => "Notification" in window;
export const permission = () => (supported() ? Notification.permission : "denied");

export async function enable() {
  if (!supported()) throw new Error("This browser doesn't support notifications. On iPhone, add Campus OS to your Home Screen first.");
  let p = Notification.permission;
  if (p === "default") p = await Notification.requestPermission();
  if (p !== "granted") throw new Error("Notifications are blocked. Allow them for this site in your browser or phone settings, then try again.");
  setPrefs({ on: true });
  notify("Reminders are on", "You'll get class alerts while Campus OS is open.", "welcome", "#/");
}
export function disable() { setPrefs({ on: false }); }

function seen() { try { return JSON.parse(localStorage.getItem(SEEN) || "{}"); } catch (_) { return {}; } }
function remember(key) {
  const s = seen(), cut = Date.now() - 3 * 864e5;
  Object.keys(s).forEach(k => { if (s[k] < cut) delete s[k]; });
  s[key] = Date.now();
  try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch (_) { /* ignore */ }
}

export async function notify(title, body, tag, url) {
  const opts = { body, tag, icon: "assets/icon-192.png", badge: "assets/icon-192.png", data: { url: url || "#/" } };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
  } catch (_) { /* fall through */ }
  try { new Notification(title, opts); } catch (_) { /* unsupported */ }
}

function tick(getData) {
  const p = prefs();
  if (!p.on || permission() !== "granted") return;
  const d = getData(), t = today(), now = nowMinutes(), done = seen();
  const subj = id => d.subjects.find(s => s.id === id);
  classesOn(d, t).forEach(c => {
    const s = subj(c.subjectId), st = toMin(c.start), en = toMin(c.end);
    if (!s || st == null) return;
    const kStart = "s:" + t + ":" + c.id, kMark = "m:" + t + ":" + c.id;
    const until = st - now;
    if (!done[kStart] && until <= p.lead && until > -5) {
      remember(kStart);
      notify(s.name + (until > 1 ? " in " + until + " min" : " is starting"), [fmtTime(c.start) + (c.end ? "–" + fmtTime(c.end) : ""), c.room].filter(Boolean).join(" · "), kStart, "#/");
    }
    const marked = d.attendance.some(r => r.date === t && r.slotId === c.id);
    if (p.markAfter && en != null && !marked && !done[kMark] && now >= en + 3 && now <= en + 120) {
      remember(kMark);
      notify("Mark attendance — " + s.name, "Class ended at " + fmtTime(c.end) + ". One tap to mark present or absent.", kMark, "#/");
    }
  });
  const kDig = "d:" + t;
  if (p.digest && !done[kDig] && now >= 7 * 60 + 30 && now <= 12 * 60) {
    const todays = classesOn(d, t).length;
    const open = d.tasks.filter(x => !x.done && x.due);
    const dueToday = open.filter(x => x.due <= t).length, dueTomorrow = open.filter(x => x.due === addDays(t, 1)).length;
    const ex = d.exams.filter(e => e.date >= t && daysBetween(t, e.date) <= 3).sort((a, b) => a.date.localeCompare(b.date))[0];
    const bits = [];
    if (todays) bits.push(plural(todays, "class", "classes") + " today");
    if (dueToday) bits.push(plural(dueToday, "task") + " due or overdue");
    if (dueTomorrow) bits.push(plural(dueTomorrow, "task") + " due tomorrow");
    if (ex) { const s = subj(ex.subjectId); bits.push((s ? s.name : "Exam") + (daysBetween(t, ex.date) === 0 ? " exam today" : " exam in " + plural(daysBetween(t, ex.date), "day"))); }
    remember(kDig);
    if (bits.length) notify("Your day", bits.join(" · "), kDig, "#/");
  }
}

export function startReminders(getData) {
  const run = () => { try { tick(getData); } catch (_) { /* ignore */ } };
  setInterval(run, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
  setTimeout(run, 4000);
}
