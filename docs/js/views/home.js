import { esc, today, greeting, maskLines, fmtTime, relDay, daysBetween, plural, pct, money, fmtDate, DAYS, DAYS_LONG } from "../ui.js";
import { overallStats, subjectStats, classesOn, nextClass, verdict, weekSummary } from "../calc.js";
import { subjById, subjectForm, classForm, taskForm, toggleTask } from "../actions.js";
import { classRows, bindClassRows } from "./attendance.js";
import { emptyState } from "./common.js";
import { streak, risks, nextPlan } from "../insights.js";
import { nowCard, liveNow } from "./now.js";
import { replaceAll } from "../store.js";
import { demoData } from "../demo.js";
import { profileForm } from "../profile.js";
import * as sync from "../sync.js";
import { toast } from "../ui.js";

let raf = 0;

export function render(root, d) {
  const t = today();
  const o = overallStats(d);
  const todays = classesOn(d, t);
  const pending = d.tasks.filter(x => !x.done);
  const dueSoon = pending.filter(x => x.due && daysBetween(t, x.due) <= 7);
  const overdue = pending.filter(x => x.due && x.due < t);
  const exams = d.exams.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const nx = nextClass(d);
  const name = (d.profile.name || "").split(" ")[0];
  const subs = d.subjects.filter(s => !s.archived);
  const fresh = !subs.length;
  const unmarked = todays.filter(c => !d.attendance.some(r => r.date === t && r.slotId === c.id)).length;

  const headline = name
    ? [esc(greeting()) + ",", esc(name) + "."]
    : ["Your semester,", "sorted."];

  const ticker = [];
  if (nx) {
    const s = subjById(nx.entry.subjectId);
    ticker.push((nx.isToday ? "Next up" : DAYS_LONG[(new Date(nx.date).getDay() + 6) % 7]) + " — " + (s ? s.name : "Class") + (nx.entry.start ? " at " + fmtTime(nx.entry.start) : ""));
  }
  if (o.total) ticker.push("Attendance " + pct(o.percent) + "% — " + verdict(o).text);
  if (exams[0]) ticker.push((subjById(exams[0].subjectId)?.name || exams[0].title || "Exam") + " exam " + relDay(exams[0].date).toLowerCase());
  if (overdue.length) ticker.push(plural(overdue.length, "task") + " overdue");
  if (dueSoon.length) ticker.push(plural(dueSoon.length, "task") + " due this week");
  if (!ticker.length) ticker.push("Attendance", "Timetable", "Assignments", "Exams", "GPA", "Notes", "Budget", "Focus");
  const tick = ticker.map(x => "<span>" + esc(x) + "</span>").join("");

  const upcoming = []
    .concat(pending.filter(x => x.due).map(x => ({ kind: "task", date: x.due, x })))
    .concat(exams.map(e => ({ kind: "exam", date: e.date, x: e })))
    .filter(u => daysBetween(t, u.date) <= 21)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  root.innerHTML =
    '<section class="hero">' +
      '<canvas id="hero-canvas" aria-hidden="true"></canvas>' +
      '<p class="mono muted fade-up" style="--d:.1s">' + esc([d.profile.college, d.profile.course, d.profile.semester && "Semester " + d.profile.semester].filter(Boolean).join(" · ") || "The all-in-one college companion") + "</p>" +
      '<h1 class="display h-xl" style="margin-top:18px">' + maskLines(headline) + "</h1>" +
      (fresh ? heroCta() : '<div class="hero-meta">' +
        stat("#/attendance", "Attendance", o.total ? pct(o.percent) + "%" : "—", o.total ? verdict(o).text : "Start marking classes", o.total ? (o.ok ? "good" : "bad") : "", ".2s") +
        stat("#/attendance", "Classes today", String(todays.length), todays.length ? (unmarked ? unmarked + " to mark" : "All marked ✓") : "Free day", "", ".28s") +
        stat("#/tasks", "Due this week", String(dueSoon.length), overdue.length ? overdue.length + " overdue" : plural(pending.length, "open task"), overdue.length ? "bad" : "", ".36s") +
        stat("#/exams", "Next exam", exams[0] ? daysLabel(daysBetween(t, exams[0].date)) : "—", exams[0] ? (subjById(exams[0].subjectId)?.name || exams[0].title || "Exam") : "None scheduled", "", ".44s") +
      "</div>") +
    "</section>" +
    '<div class="marquee" aria-hidden="true"><div class="track">' + tick + tick + "</div><div class=\"track\">" + tick + tick + "</div></div>" +
    '<div class="page" style="padding-top:clamp(40px,6vw,80px)">' +
      (fresh ? welcome(d) : timetableNudge(d, subs) + nowCard(d) + wrappedTeaser(d)) +
      (fresh ? "" : '<div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start">' +
        '<section><div class="section-head"><h2 class="h-md">Today</h2><span class="mono">' + esc(DAYS_LONG[(new Date().getDay() + 6) % 7]) + "</span></div>" +
          (todays.length ? classRows(d, t) :
            emptyState(subs.length ? "No classes today" : "No timetable yet", subs.length ? "Enjoy the free day — or add an extra class from Attendance." : "Add subjects and your weekly classes to see them here.",
              subs.length ? "" : '<button class="btn sm" data-act="add-class">+ Add a class</button>')) +
        "</section>" +
        '<section><div class="section-head"><h2 class="h-md">Coming up</h2><a class="mono" href="#/tasks">All tasks →</a></div>' +
          (upcoming.length ? '<div class="list">' + upcoming.map(u => upcomingRow(u, t)).join("") + "</div>" :
            emptyState("Nothing due", "Deadlines and exams for the next three weeks appear here.", '<button class="btn sm" data-act="add-task">+ Add a task</button>')) +
        "</section>" +
      "</div>" +
      headsUp(d) +
      weekSection(d)) +
      (subs.length ? '<section class="section"><div class="section-head"><h2 class="h-md">Subjects</h2><a class="mono" href="#/attendance">Attendance →</a></div>' +
        '<div class="grid auto">' + subs.map(s => miniSubject(d, s)).join("") + "</div></section>" : "") +
    "</div>";

  bindClassRows(root, d, t);
  root.addEventListener("click", e => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    if (act === "add-subject") subjectForm(null);
    if (act === "add-class") classForm(null);
    if (act === "add-task") taskForm(null);
    if (act === "toggle-task") toggleTask(a.dataset.id);
    if (act === "edit-task") taskForm(d.tasks.find(x => x.id === a.dataset.id));
    if (act === "profile") profileForm();
    if (act === "import") import("../import.js").then(m => m.openImport());
    if (act === "sample") { replaceAll(demoData()); toast("Sample data loaded — explore around!"); }
    if (act === "signin") sync.signIn();
    if (act === "settings") location.hash = "#/settings";
  });

  startCanvas(root.querySelector("#hero-canvas"));
  const stopLive = liveNow(root, d);
  return () => { cancelAnimationFrame(raf); stopLive(); };
}

function daysLabel(n) { return n === 0 ? "Today" : n === 1 ? "1 day" : n + " days"; }

function stat(href, label, value, foot, cls, delay) {
  return '<a href="' + href + '" class="fade-up" style="--d:' + delay + '"><div class="mono muted">' + esc(label) + "</div>" +
    '<div class="num ' + cls + '">' + esc(value) + '</div><div class="muted" style="font-size:13px;margin-top:8px">' + esc(foot) + "</div></a>";
}

function upcomingRow(u, t) {
  const days = daysBetween(t, u.date);
  const when = '<span class="mono ' + (days < 0 ? "bad" : days <= 1 ? "warn" : "muted") + '" style="width:92px;flex:none">' + esc(relDay(u.date)) + "</span>";
  if (u.kind === "exam") {
    const s = subjById(u.x.subjectId);
    return '<div class="item">' + when + '<div class="grow"><div class="title">' + esc((s ? s.name : "") + (u.x.title ? (s ? " — " : "") + u.x.title : "")) + '</div><div class="sub">' + esc(u.x.kind || "Exam") + (u.x.time ? " · " + fmtTime(u.x.time) : "") + (u.x.room ? " · " + esc(u.x.room) : "") + '</div></div><span class="pill solid">Exam</span></div>';
  }
  const s = subjById(u.x.subjectId);
  return '<div class="item">' + when + '<input type="checkbox" data-act="toggle-task" data-id="' + u.x.id + '" aria-label="Mark done">' +
    '<div class="grow" data-act="edit-task" data-id="' + u.x.id + '" style="cursor:pointer"><div class="title">' + esc(u.x.title) + '</div><div class="sub">' + esc([u.x.kind, s && s.name].filter(Boolean).join(" · ")) + "</div></div>" +
    (u.x.priority === "High" ? '<span class="pill bad">High</span>' : "") + "</div>";
}

function miniSubject(d, s) {
  const st = subjectStats(d, s);
  const v = verdict(st);
  return '<a href="#/attendance" class="card hover" style="text-decoration:none;display:flex;flex-direction:column;gap:12px">' +
    '<div class="spread"><span class="row" style="gap:8px"><i class="dot" style="--c:' + esc(s.color) + '"></i><span class="mono muted">' + esc(s.code || "Subject") + "</span></span>" +
    '<span class="num ' + (st.total ? (st.ok ? "good" : "bad") : "faint") + '" style="font-size:34px">' + (st.total ? pct(st.percent) + "%" : "—") + "</span></div>" +
    '<div class="h-sm">' + esc(s.name) + "</div>" +
    '<div class="bar"><i class="' + (st.ok ? "good" : "bad") + '" style="width:' + (st.percent || 0) + '%"></i><b style="left:' + st.target + '%"></b></div>' +
    '<div class="' + v.cls + '" style="font-size:13px">' + esc(v.text) + "</div></a>";
}

function heroCta() {
  return '<div class="hero-cta fade-up" style="--d:.25s">' +
    '<button class="btn solid" data-act="add-subject">Add your first subject</button>' +
    '<button class="btn" data-act="import">Import timetable from a photo</button>' +
    '<button class="btn ghost" data-act="sample">Try with sample data</button></div>';
}

/** Shown when subjects exist but no weekly classes yet — the live "Now" card needs a timetable. */
function timetableNudge(d, subs) {
  if (!subs.length || d.timetable.length) return "";
  return '<section class="nowcard nudge"><div class="nc-top"><span class="mono">One more step</span></div>' +
    '<div class="nc-title">Add your weekly timetable</div><div class="nc-meta">Then Home shows the class happening right now, with one-tap attendance.</div>' +
    '<div class="nc-acts"><button class="btn solid" data-act="add-class">+ Add a class</button><button class="btn" data-act="import">Import from photo / PDF</button></div></section>';
}

/** First-run Home: a clear next step, a preview of the payoff, and what else is optional. */
function welcome(d) {
  const steps = [
    { t: "Tell us about you", d: "Name, college and your attendance target.", act: "profile", label: "Add details", done: !!d.profile.name },
    { t: "Add your subjects", d: "Course names, codes, faculty and credits.", act: "add-subject", label: "+ Subject", done: d.subjects.length > 0 },
    { t: "Build your timetable", d: "Add your weekly classes — or import them from a photo or PDF.", act: "add-class", label: "+ Class", alt: ["import", "Import"], done: d.timetable.length > 0 },
  ];
  const doneN = steps.filter(x => x.done).length, cur = steps.findIndex(x => !x.done);
  const rows = steps.map((x, i) =>
    '<div class="setup-item' + (x.done ? " done" : i === cur ? " cur" : "") + '"><span class="setup-n">' + (x.done ? "✓" : i + 1) + "</span>" +
    '<div class="grow"><div class="title">' + esc(x.t) + '</div><div class="sub">' + esc(x.d) + "</div></div>" +
    (x.done ? '<span class="mono faint">Done</span>' : '<span class="setup-acts"><button class="btn sm' + (i === cur ? " solid" : "") + '" data-act="' + x.act + '">' + esc(x.label) + "</button>" +
      (x.alt ? '<button class="btn sm ghost" data-act="' + x.alt[0] + '">' + esc(x.alt[1]) + "</button>" : "") + "</span>") + "</div>").join("");
  return '<section class="welcome">' +
    '<div class="grid g2" style="gap:clamp(24px,4vw,64px);align-items:start">' +
      '<div><div class="section-head"><h2 class="h-md">Let’s set up your semester</h2><span class="mono">' + doneN + " of 3 · about 2 min</span></div>" +
        '<div class="setup-bar"><i style="width:' + Math.round(doneN / 3 * 100) + '%"></i></div>' +
        '<div class="setup">' + rows + "</div>" +
        '<div class="setup-opt"><span class="mono faint">Optional</span>' +
          '<button class="chip" data-act="signin">☁ Sync across devices</button>' +
          '<button class="chip" data-act="settings">🔔 Set up reminders</button>' +
          '<a class="chip" href="#/focus">◷ Try the focus timer</a></div></div>' +
      '<div class="welcome-prev" aria-hidden="true"><div class="mono muted" style="margin-bottom:10px">Preview — this is what Home becomes</div>' +
        '<div class="nowcard live preview"><div class="nc-top"><span class="mono">Now · 10:00am–11:00am</span><span class="nc-live mono"><i></i>Live</span></div>' +
        '<div class="nc-title">Data Structures</div><div class="nc-meta">Lecture · Room 204</div>' +
        '<div class="nc-prog"><i style="width:38%"></i></div><div class="nc-count">37 min left</div>' +
        '<div class="nc-acts"><span class="btn sm good-b">Present</span><span class="btn sm bad-b">Absent</span><span class="btn sm">Cancelled</span></div>' +
        '<div class="nc-next">Then: <b>Database Systems</b> at 11:15am · Lab 3</div></div>' +
        '<ul class="welcome-feats"><li><b>Know what’s safe to skip</b> — before you decide to bunk</li><li><b>Never miss a deadline</b> — tasks, exams and reminders in one place</li><li><b>Private by design</b> — your data stays on your device unless you sync</li></ul></div>' +
    "</div></section>";
}

// ---------- generative hero: a slowly breathing fan of hairlines ----------
function startCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, dpr = 1;
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  size();
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#fff";
  const LINES = 150;
  const t0 = performance.now();
  function frame(now) {
    if (!canvas.isConnected) { ro.disconnect(); return; }
    const t = reduce ? 0 : (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = ink;
    const ox = w * 1.04, oy = h * 1.08;             // fan origin, bottom-right just off-canvas
    const R = Math.hypot(w, h) * 1.15;
    for (let i = 0; i < LINES; i++) {
      const f = i / (LINES - 1);
      const base = Math.PI + f * (Math.PI / 2) * 1.02;   // sweep from left to up
      const sway = Math.sin(t * 0.35 + f * 6.0) * 0.05 + Math.sin(t * 0.21 + f * 13.0) * 0.025;
      const a = base + sway;
      const bend = 0.22 + 0.12 * Math.sin(t * 0.3 + f * 9);
      const ex = ox + Math.cos(a) * R, ey = oy + Math.sin(a) * R;
      const mx = ox + Math.cos(a + bend) * R * 0.55, my = oy + Math.sin(a + bend) * R * 0.55;
      const glow = 0.5 + 0.5 * Math.sin(f * 22 - t * 0.8);
      ctx.globalAlpha = 0.05 + glow * 0.16;
      ctx.lineWidth = i % 9 === 0 ? 1.2 : 0.6;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

// ---------- "This week" recap ----------
function delta(now, prev, opts) {
  opts = opts || {};
  if (prev == null || now == null) return "";
  const diff = now - prev;
  if (Math.abs(diff) < (opts.eps || 0.05)) return '<span class="delta flat">— same as last week</span>';
  const up = diff > 0, good = opts.lowerIsBetter ? !up : up;
  return '<span class="delta ' + (good ? "good" : "bad") + '">' + (up ? "↑ " : "↓ ") + esc(opts.fmt ? opts.fmt(Math.abs(diff)) : String(Math.round(Math.abs(diff)))) + " vs last week</span>";
}

function weekSection(d) {
  const w = weekSummary(d);
  const cur = d.settings.currency || "₹";
  const hasAny = w.att.total || w.prevAtt.total || w.spend.total || w.spend.prev || w.focus.min || w.focus.prev || w.tasks.done || w.tasks.prev;
  if (!d.subjects.length || !hasAny) return "";
  const lines = [];
  if (w.att.total) lines.push("You've been to " + w.att.present + " of " + plural(w.att.total, "class", "classes") + " this week (" + pct(w.att.pct) + "%)");
  if (w.focus.min) lines.push("focused for " + (Math.round(w.focus.min / 6) / 10) + " h");
  if (w.tasks.done) lines.push("finished " + plural(w.tasks.done, "task"));
  const headline = lines.length ? lines.join(", ").replace(/^(.)/, c => c) + "." : "A quiet week so far.";
  const strip = w.strip.map(s =>
    '<div class="wd' + (s.today ? " today" : "") + (s.future ? " future" : "") + '"><div class="mono">' + DAYS[s.i] + '</div><div class="dots">' +
    (s.future ? "" : (Array(Math.min(s.present, 6)).fill('<i class="st-present"></i>').join("") + Array(Math.min(s.absent, 6)).fill('<i class="st-absent"></i>').join("")) || '<i style="background:var(--line-2)"></i>') + "</div></div>").join("");
  const spendTop = w.spend.top ? w.spend.top[0] + " · " + money(w.spend.top[1], cur) : "No spending logged";
  return '<section class="section"><div class="section-head"><h2 class="h-md">This week</h2><span class="mono">' + esc(fmtDate(w.start, { weekday: false })) + " – " + esc(fmtDate(w.end, { weekday: false })) + "</span></div>" +
    '<p class="muted" style="margin:0 0 18px;max-width:60ch">' + esc(headline) + "</p>" +
    '<div class="wstrip" style="margin-bottom:14px">' + strip + "</div>" +
    '<div class="grid g4 wkgrid">' +
      '<a href="#/attendance" class="card hover" style="text-decoration:none"><div class="mono muted">Attendance</div><div class="num ' + (w.att.total ? (w.att.pct >= (d.profile.target || 75) ? "good" : "bad") : "faint") + '" style="font-size:44px;margin:12px 0 8px">' + (w.att.total ? esc(pct(w.att.pct)) + "%" : "—") + "</div>" +
        (w.att.total && w.prevAtt.total ? delta(w.att.pct, w.prevAtt.pct, { eps: 0.5, fmt: n => (Math.round(n * 10) / 10) + " pts" }) : '<span class="delta flat">' + (w.att.total ? "first week of data" : "no classes marked yet") + "</span>") + "</a>" +
      '<a href="#/budget" class="card hover" style="text-decoration:none"><div class="mono muted">Spent</div><div class="num" style="font-size:44px;margin:12px 0 8px">' + esc(money(w.spend.total, cur)) + "</div>" +
        (w.spend.prev || w.spend.total ? delta(w.spend.total, w.spend.prev, { lowerIsBetter: true, eps: 1, fmt: n => money(n, cur) }) + '<div class="muted" style="font-size:12px;margin-top:6px">' + esc(spendTop) + "</div>" : '<span class="delta flat">nothing logged</span>') + "</a>" +
      '<a href="#/focus" class="card hover" style="text-decoration:none"><div class="mono muted">Focus</div><div class="num" style="font-size:44px;margin:12px 0 8px">' + (Math.round(w.focus.min / 6) / 10) + '<span class="faint" style="font-size:.4em"> h</span></div>' +
        (w.focus.min || w.focus.prev ? delta(w.focus.min, w.focus.prev, { eps: 1, fmt: n => n + " min" }) : '<span class="delta flat">no sessions yet</span>') + "</a>" +
      '<a href="#/tasks" class="card hover" style="text-decoration:none"><div class="mono muted">Tasks done</div><div class="num" style="font-size:44px;margin:12px 0 8px">' + w.tasks.done + "</div>" +
        (w.tasks.done || w.tasks.prev ? delta(w.tasks.done, w.tasks.prev, { eps: 0.5, fmt: n => String(n) }) : '<span class="delta flat">nothing finished yet</span>') + "</a>" +
    "</div></section>";
}

// ---------- "Heads up": streak, plan for the next class day, at-risk subjects ----------
function headsUp(d) {
  if (!d.subjects.some(x => !x.archived)) return "";
  const st = streak(d), rk = risks(d), plan = nextPlan(d);
  if (!st.days && !plan) return "";
  const dayWord = plan ? (plan.isToday ? "Still to go today" : relDay(plan.date) === "Tomorrow" ? "Tomorrow" : DAYS_LONG[(new Date(plan.date + "T00:00").getDay() + 6) % 7]) : "";
  const planRows = plan ? plan.items.map(it => {
    const s = it.subject, n = it.count;
    let pill, note;
    if (it.tone === "skip") { pill = '<span class="pill good">Safe to skip</span>'; note = "You'd stay at " + pct(it.afterPct) + "% (target " + it.st.target + "%)"; }
    else if (it.tone === "attend") { pill = '<span class="pill ' + (it.st.ok ? "warn" : "bad") + '">Better attend</span>'; note = it.st.ok ? "Missing would drop you to " + pct(it.afterPct) + "%" : "Already below " + it.st.target + "% — attend to recover"; }
    else { pill = '<span class="pill">Not enough data</span>'; note = "Mark a few classes to get advice"; }
    return '<div class="item" style="padding:12px 4px"><span class="swatch" style="--c:' + esc(s.color) + ';align-self:stretch"></span><div class="grow"><div class="title">' + esc(s.name) + (n > 1 ? ' <span class="muted" style="font-weight:400">× ' + n + "</span>" : "") + '</div><div class="sub">' + esc(note) + "</div></div>" + pill + "</div>";
  }).join("") : "";
  const watch = rk.length ? rk.map(r =>
    '<a href="#/attendance" class="item" style="text-decoration:none;padding:12px 4px"><span class="swatch" style="--c:var(--' + (r.level === "bad" ? "bad" : "warn") + ');align-self:stretch"></span><div class="grow"><div class="title">' + esc(r.subject.name) + '</div><div class="sub">' +
    (r.level === "bad" ? "Attend the next " + plural(r.st.need, "class", "classes") + " in a row to get back to " + r.st.target + "%" : "On the edge — one more miss drops you below " + r.st.target + "%") + '</div></div><span class="num ' + (r.level === "bad" ? "bad" : "warn") + '" style="font-size:24px">' + esc(pct(r.st.percent)) + "%</span></a>").join("") :
    '<div class="empty" style="padding:22px 16px"><p class="h-sm" style="margin:0 0 4px">All clear</p><p style="margin:0">Every subject is above its target. Nice.</p></div>';
  return '<section class="section"><div class="section-head"><h2 class="h-md">Heads up</h2>' +
    (st.current ? '<span class="pill solid">◆ ' + st.current + "-day streak" + (st.best > st.current ? " · best " + st.best : "") + "</span>" : (st.best ? '<span class="mono">Best streak ' + st.best + " days</span>" : "")) + "</div>" +
    '<div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start">' +
      '<div><div class="mono muted" style="margin-bottom:6px">' + (plan ? esc(dayWord) + " · what's safe to skip" : "Plan") + "</div>" +
        (plan ? '<div class="list">' + planRows + '</div><p class="mono faint" style="margin:10px 0 0;font-size:10px">Suggestion only — your college’s rules decide.</p>' : '<p class="muted">No classes coming up — add them to your timetable.</p>') + "</div>" +
      '<div><div class="mono muted" style="margin-bottom:6px">Watch list' + (rk.length ? " · " + rk.length : "") + '</div><div class="list" style="border-top:' + (rk.length ? "1px solid var(--line)" : "0") + '">' + watch + "</div></div>" +
    "</div></section>";
}

function wrappedTeaser(d) {
  if (d.attendance.length < 20) return "";
  return '<a href="#/wrapped" class="wr-teaser"><span class="mono">New · Semester Wrapped</span><span class="h-sm">See your semester in numbers ✦</span><span class="mono">Open →</span></a>';
}
