// Attendance and grade maths
import { weekday, today, toMin, addDays } from "./ui.js";

/** present/absent → percentage, classes you can still miss, classes needed to recover. */
export function attStats(present, absent, target) {
  const total = present + absent;
  const t = target / 100;
  const percent = total ? (present / total) * 100 : null;
  let canSkip = 0, need = 0;
  if (total) {
    if (percent + 1e-9 >= target) canSkip = t > 0 ? Math.max(0, Math.floor(present / t - total + 1e-9)) : Infinity;
    else need = t < 1 ? Math.ceil((t * total - present) / (1 - t) - 1e-9) : -1;
  }
  return { present, absent, total, percent, canSkip, need, ok: percent != null && percent + 1e-9 >= target };
}

export function targetFor(d, subj) {
  return subj && subj.target != null && subj.target !== "" ? Number(subj.target) : Number(d.profile.target || 75);
}

export function subjectStats(d, subj) {
  let p = 0, a = 0, c = 0, last = null;
  for (const r of d.attendance) {
    if (r.subjectId !== subj.id) continue;
    if (r.status === "present") p++;
    else if (r.status === "absent") a++;
    else c++;
    if (!last || r.date > last) last = r.date;
  }
  return Object.assign(attStats(p, a, targetFor(d, subj)), { cancelled: c, last, target: targetFor(d, subj) });
}

export function overallStats(d) {
  const ids = new Set(d.subjects.filter(s => !s.archived).map(s => s.id));
  let p = 0, a = 0;
  for (const r of d.attendance) {
    if (!ids.has(r.subjectId)) continue;
    if (r.status === "present") p++;
    else if (r.status === "absent") a++;
  }
  return Object.assign(attStats(p, a, Number(d.profile.target || 75)), { target: Number(d.profile.target || 75) });
}

export function verdict(s) {
  if (!s.total) return { text: "No classes recorded yet", cls: "muted" };
  if (s.ok) {
    if (s.canSkip === 0) return { text: "On the edge — don't miss the next class", cls: "warn" };
    return { text: "Safe to miss " + s.canSkip + " class" + (s.canSkip === 1 ? "" : "es"), cls: "good" };
  }
  if (s.need < 0) return { text: "100% target can't be recovered", cls: "bad" };
  return { text: "Attend next " + s.need + " class" + (s.need === 1 ? "" : "es") + " to recover", cls: "bad" };
}

/** Timetable entries for a date, sorted by start time. */
export function classesOn(d, dateStr) {
  const wd = weekday(dateStr);
  const active = new Set(d.subjects.filter(s => !s.archived).map(s => s.id));
  return d.timetable
    .filter(t => t.day === wd && active.has(t.subjectId))
    .sort((a, b) => (toMin(a.start) ?? 9999) - (toMin(b.start) ?? 9999));
}

/** Next upcoming class from now (today or later this week). */
export function nextClass(d) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const t = today();
  for (let i = 0; i < 7; i++) {
    const date = new Date(now); date.setDate(now.getDate() + i);
    const ds = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    const list = classesOn(d, ds).filter(c => i > 0 || (toMin(c.end || c.start) ?? 0) > mins);
    if (list.length) return { entry: list[0], date: ds, isToday: ds === t };
  }
  return null;
}

// ---------- grades ----------
export const SCALES = {
  "10": { label: "10-point (O, A+, A …)", max: 10, grades: [["O", 10], ["A+", 9], ["A", 8], ["B+", 7], ["B", 6], ["C", 5], ["P", 4], ["F", 0]] },
  "4": { label: "4-point (A, A-, B+ …)", max: 4, grades: [["A+", 4], ["A", 4], ["A-", 3.7], ["B+", 3.3], ["B", 3], ["B-", 2.7], ["C+", 2.3], ["C", 2], ["C-", 1.7], ["D", 1], ["F", 0]] },
};

export function gradePoint(scale, grade) {
  const s = SCALES[scale] || SCALES["10"];
  const g = s.grades.find(x => x[0] === grade);
  if (g) return g[1];
  const n = Number(grade);
  return isFinite(n) && grade !== "" ? n : null;
}

export function semesterGPA(scale, sem) {
  let cr = 0, pts = 0;
  for (const c of sem.courses || []) {
    const gp = gradePoint(scale, c.grade);
    const credits = Number(c.credits) || 0;
    if (gp == null || !credits) continue;
    cr += credits; pts += gp * credits;
  }
  return { credits: cr, gpa: cr ? pts / cr : null, points: pts };
}

export function cgpa(scale, semesters) {
  let cr = 0, pts = 0;
  for (const s of semesters) { const r = semesterGPA(scale, s); cr += r.credits; pts += r.points; }
  return { credits: cr, gpa: cr ? pts / cr : null, points: pts };
}

// ---------- weekly summary (Mon–Sun, compared with the week before) ----------
export function weekSummary(d) {
  const t = today();
  const start = addDays(t, -weekday(t)), end = addDays(start, 6);
  const pStart = addDays(start, -7), pEnd = addDays(start, -1);
  const active = new Set(d.subjects.filter(s => !s.archived).map(s => s.id));
  const att = (a, b) => {
    let p = 0, ab = 0;
    d.attendance.forEach(r => { if (active.has(r.subjectId) && r.date >= a && r.date <= b) { if (r.status === "present") p++; else if (r.status === "absent") ab++; } });
    return { present: p, absent: ab, total: p + ab, pct: p + ab ? p / (p + ab) * 100 : null };
  };
  const strip = Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(start, i);
    const recs = d.attendance.filter(r => r.date === ds && active.has(r.subjectId));
    return { ds, i, today: ds === t, future: ds > t, present: recs.filter(r => r.status === "present").length, absent: recs.filter(r => r.status === "absent").length };
  });
  const spendIn = (a, b) => d.money.filter(m => m.kind === "expense" && m.date >= a && m.date <= b);
  const sum = l => l.reduce((x, m) => x + Number(m.amount), 0);
  const cur = spendIn(start, end);
  const cats = {};
  cur.forEach(m => { cats[m.category] = (cats[m.category] || 0) + Number(m.amount); });
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0] || null;
  const focus = (a, b) => d.focus.filter(f => f.date >= a && f.date <= b).reduce((x, f) => x + f.minutes, 0);
  const done = (a, b) => d.tasks.filter(x => x.done && x.doneAt && x.doneAt >= a && x.doneAt <= b).length;
  return {
    start, end, strip,
    att: att(start, end), prevAtt: att(pStart, pEnd),
    spend: { total: sum(cur), prev: sum(spendIn(pStart, pEnd)), top },
    focus: { min: focus(start, end), prev: focus(pStart, pEnd) },
    tasks: { done: done(start, end), prev: done(pStart, pEnd) },
  };
}
