// Smart attendance insights: streaks, "safe to skip" plan, and at-risk alerts.
import { today, addDays, daysBetween } from "./ui.js";
import { attStats, subjectStats, classesOn } from "./calc.js";

/** Streak of consecutive class days with no absence (cancelled classes ignored). */
export function streak(d) {
  const active = new Set(d.subjects.filter(s => !s.archived).map(s => s.id));
  const byDate = new Map();
  d.attendance.forEach(r => {
    if (!active.has(r.subjectId) || r.status === "cancelled") return;
    const e = byDate.get(r.date) || { p: 0, a: 0 };
    if (r.status === "present") e.p++; else e.a++;
    byDate.set(r.date, e);
  });
  const dates = [...byDate.keys()].sort();
  let best = 0, run = 0;
  dates.forEach(ds => { if (byDate.get(ds).a === 0) { run++; if (run > best) best = run; } else run = 0; });
  const last = dates[dates.length - 1] || null;
  // a streak lapses if nothing has been marked for more than a long weekend
  const current = last && daysBetween(last, today()) <= 3 ? run : 0;
  return { current, best, last, days: dates.length };
}

/** Subjects below target ("bad") or sitting exactly on the edge ("warn"). Needs a few classes of data. */
export function risks(d) {
  const out = [];
  d.subjects.filter(s => !s.archived).forEach(s => {
    const st = subjectStats(d, s);
    if (st.total < 3) return;
    if (!st.ok) out.push({ level: "bad", subject: s, st });
    else if (st.canSkip === 0) out.push({ level: "warn", subject: s, st });
  });
  out.sort((a, b) => (a.level === b.level ? a.st.percent - b.st.percent : a.level === "bad" ? -1 : 1));
  return out;
}

/** What's safe to skip: the rest of today if classes are still unmarked, otherwise the next class day. */
export function nextPlan(d) {
  const t = today();
  const todayLeft = classesOn(d, t).filter(c => !d.attendance.some(r => r.date === t && r.slotId === c.id));
  let date = null, list = [];
  if (todayLeft.length) { date = t; list = todayLeft; }
  else {
    for (let k = 1; k <= 7; k++) {
      const ds = addDays(t, k), cs = classesOn(d, ds);
      if (cs.length) { date = ds; list = cs; break; }
    }
  }
  if (!date) return null;
  const bySubject = new Map();
  list.forEach(c => bySubject.set(c.subjectId, (bySubject.get(c.subjectId) || 0) + 1));
  const items = [];
  bySubject.forEach((count, sid) => {
    const subject = d.subjects.find(s => s.id === sid);
    if (!subject) return;
    const st = subjectStats(d, subject);
    const after = attStats(st.present, st.absent + count, st.target);
    let tone = "neutral";
    if (st.total >= 3) tone = after.ok ? "skip" : "attend";
    items.push({ subject, count, st, afterPct: after.percent, tone });
  });
  items.sort((a, b) => ({ attend: 0, neutral: 1, skip: 2 }[a.tone] - { attend: 0, neutral: 1, skip: 2 }[b.tone]));
  return { date, isToday: date === t, items };
}
