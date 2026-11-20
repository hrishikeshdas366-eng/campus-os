import { esc, today, greeting, maskLines, fmtTime, relDay, daysBetween, plural, pct, DAYS_LONG } from "../ui.js";
import { overallStats, subjectStats, classesOn, nextClass, verdict } from "../calc.js";
import { subjById, subjectForm, classForm, taskForm, toggleTask } from "../actions.js";
import { classRows, bindClassRows } from "./attendance.js";
import { emptyState } from "./common.js";

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
      '<div class="hero-meta">' +
        stat("#/attendance", "Attendance", o.total ? pct(o.percent) + "%" : "—", o.total ? verdict(o).text : "Start marking classes", o.total ? (o.ok ? "good" : "bad") : "", ".2s") +
        stat("#/attendance", "Classes today", String(todays.length), todays.length ? (unmarked ? unmarked + " to mark" : "All marked ✓") : "Free day", "", ".28s") +
        stat("#/tasks", "Due this week", String(dueSoon.length), overdue.length ? overdue.length + " overdue" : plural(pending.length, "open task"), overdue.length ? "bad" : "", ".36s") +
        stat("#/exams", "Next exam", exams[0] ? daysLabel(daysBetween(t, exams[0].date)) : "—", exams[0] ? (subjById(exams[0].subjectId)?.name || exams[0].title || "Exam") : "None scheduled", "", ".44s") +
      "</div>" +
    "</section>" +
    '<div class="marquee" aria-hidden="true"><div class="track">' + tick + tick + "</div><div class=\"track\">" + tick + tick + "</div></div>" +
    '<div class="page" style="padding-top:clamp(40px,6vw,80px)">' +
      (subs.length ? "" : onboarding(d)) +
      '<div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start">' +
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
    if (act === "profile") location.hash = "#/settings";
  });

  startCanvas(root.querySelector("#hero-canvas"));
  return () => cancelAnimationFrame(raf);
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

function onboarding(d) {
  const steps = [
    ["01", "Tell us about you", "Name, college and your attendance target.", "profile", !!d.profile.name],
    ["02", "Add your subjects", "Course names, codes, faculty and credits.", "add-subject", d.subjects.length > 0],
    ["03", "Build your timetable", "Your weekly classes — then mark attendance in one tap.", "add-class", d.timetable.length > 0],
  ];
  return '<section style="margin-bottom:clamp(40px,5vw,72px)"><div class="section-head"><h2 class="h-md">Set up in three steps</h2><span class="mono">About 2 minutes</span></div>' +
    '<div class="grid g3">' + steps.map(s =>
      '<button class="card hover" data-act="' + s[3] + '" style="text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:12px;min-height:180px">' +
      '<span class="mono muted">' + s[0] + (s[4] ? " — done ✓" : "") + '</span><span class="h-md">' + s[1] + '</span><span class="muted" style="margin-top:auto">' + s[2] + "</span></button>").join("") +
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
