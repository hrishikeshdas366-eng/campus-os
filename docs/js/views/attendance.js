import { esc, today, addDays, parse, iso, fmtDate, fmtTime, relDay, weekday, pct, plural, MONTHS, DAYS } from "../ui.js";
import { toast } from "../ui.js";
import { store, update, uid } from "../store.js";
import { attStats, subjectStats, overallStats, verdict, classesOn } from "../calc.js";
import { mark, unmark, recordForm, bulkForm, subjectForm, subjById, subjectTag } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

let viewDate = today();
let cal = null; // {y, m}
const filter = { subject: "", status: "", limit: 40 };
let scrollToDay = false;

// ---------- shared with Home ----------
export function classRows(d, date) {
  const list = classesOn(d, date);
  return '<div class="list">' + list.map(c => {
    const s = d.subjects.find(x => x.id === c.subjectId);
    const rec = d.attendance.find(r => r.date === date && r.slotId === c.id);
    const acts = rec
      ? '<button class="btn xs ghost" data-ca="unmark" data-rec="' + rec.id + '">Undo</button>'
      : [["present", "Present", "good-b"], ["absent", "Absent", "bad-b"], ["cancelled", "Cancelled", ""]].map(a =>
        '<button class="btn xs ' + a[2] + '" data-ca="mark" data-st="' + a[0] + '" data-sub="' + c.subjectId + '" data-slot="' + c.id + '">' + a[1] + "</button>").join("");
    return '<div class="class-row' + (rec ? " marked-" + rec.status : "") + '">' +
      '<span class="swatch" style="--c:' + esc(s ? s.color : "") + '"></span>' +
      '<div class="time">' + esc(fmtTime(c.start)) + (c.end ? "<br>" + esc(fmtTime(c.end)) : "") + "</div>" +
      '<div><div class="name">' + esc(s ? s.name : "Subject") + '</div><div class="meta">' + esc([c.kind, c.room, s && s.code].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="acts">' + acts + "</div></div>";
  }).join("") + "</div>";
}

export function bindClassRows(root, d, date) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-ca]");
    if (!b) return;
    if (b.dataset.ca === "mark") mark(b.dataset.sub, b.dataset.st, date, { slotId: b.dataset.slot });
    else if (b.dataset.ca === "unmark") unmark(b.dataset.rec);
  });
}

/** Mark every unmarked scheduled class on a date (default: present). */
export function markRemaining(date, status) {
  status = status || "present";
  const d = store.data;
  const todo = classesOn(d, date).filter(c => !d.attendance.some(r => r.date === date && r.slotId === c.id));
  if (!todo.length) { toast("Nothing left to mark for that day"); return; }
  const ids = [];
  update(dd => todo.forEach(c => {
    const id = uid(); ids.push(id);
    dd.attendance.push({ id, subjectId: c.subjectId, date, status, note: "", slotId: c.id });
  }));
  toast(plural(todo.length, "class", "classes") + " marked " + status, {
    action: { label: "Undo", run: () => update(dd => { dd.attendance = dd.attendance.filter(r => !ids.includes(r.id)); }) },
  });
}

// ---------- page ----------
export function render(root, d, ctx) {
  const t = today();
  if (!cal) { const n = parse(viewDate); cal = { y: n.getFullYear(), m: n.getMonth() }; }
  const o = overallStats(d);
  const subs = d.subjects.filter(s => !s.archived);
  const archived = d.subjects.filter(s => s.archived);
  const activeIds = new Set(subs.map(s => s.id));
  const cancelled = d.attendance.filter(r => r.status === "cancelled" && activeIds.has(r.subjectId)).length;
  const v = verdict(o);
  const dayList = classesOn(d, viewDate);
  const left = dayList.filter(c => !d.attendance.some(r => r.date === viewDate && r.slotId === c.id)).length;
  const dayRecs = d.attendance.filter(r => r.date === viewDate && !dayList.some(c => c.id === r.slotId));

  root.innerHTML = '<div class="page">' +
    pageHead("02", "Attendance",
      '<button class="btn" data-a="bulk">Add past attendance</button><button class="btn solid" data-a="add-subject">+ Subject</button>', "Tracker") +

    // hero
    '<section class="att-hero fade-up" style="--d:.2s">' +
      '<div class="num big ' + (o.total ? (o.ok ? "good" : "bad") : "faint") + '">' + (o.total ? esc(pct(o.percent)) + "<sup>%</sup>" : "—") + "</div>" +
      '<div class="stack" style="gap:14px;padding-bottom:1vw">' +
        '<div class="h-md ' + v.cls + '">' + esc(v.text) + "</div>" +
        '<div class="bar" style="max-width:520px"><i class="' + (o.ok ? "good" : "bad") + '" style="width:' + (o.percent || 0) + '%"></i><b style="left:' + o.target + '%"></b></div>' +
        '<div class="muted">' + esc(o.present + " attended · " + o.absent + " missed" + (cancelled ? " · " + cancelled + " cancelled" : "") + " · target " + o.target + "%") + "</div>" +
      "</div></section>" +

    // day
    '<section class="section" id="day-sec"><div class="section-head"><h2 class="h-md">' + esc(relDay(viewDate)) + '</h2>' +
      '<div class="row"><button class="btn sm icon ghost" data-a="day-prev" aria-label="Previous day">←</button>' +
      '<input type="date" id="att-date" value="' + viewDate + '" style="width:auto;padding:6px 10px">' +
      '<button class="btn sm icon ghost" data-a="day-next" aria-label="Next day">→</button>' +
      (viewDate !== t ? '<button class="btn sm" data-a="day-today">Today</button>' : "") + "</div></div>" +
      (dayList.length ? classRows(d, viewDate) :
        emptyState(subs.length ? "No classes scheduled for " + fmtDate(viewDate) : "Nothing here yet",
          subs.length ? "Add them to your timetable, or log an extra class below." : "Add your subjects, then build your weekly timetable.",
          subs.length ? '<a class="btn sm" href="#/timetable">Open timetable</a>' : '<button class="btn sm" data-a="add-subject">+ Add a subject</button>')) +
      '<div class="row" style="margin-top:18px">' +
        (left ? '<button class="btn sm solid" data-a="mark-rest">Mark all remaining present (' + left + ")</button>" : "") +
        (subs.length ? '<span class="mono muted" style="margin-left:auto">Extra class</span>' +
          '<select id="extra-sub" style="width:auto;max-width:240px;padding:6px 10px">' + subs.map(s => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("") + "</select>" +
          ["present", "absent", "cancelled"].map(st => '<button class="btn xs ' + (st === "present" ? "good-b" : st === "absent" ? "bad-b" : "") + '" data-a="extra" data-st="' + st + '">' + st[0].toUpperCase() + st.slice(1) + "</button>").join("") : "") +
      "</div>" +
      (dayRecs.length ? '<div class="list" style="margin-top:18px">' + dayRecs.map(r =>
        '<div class="item" data-a="edit-rec" data-id="' + r.id + '" style="cursor:pointer">' + subjectTag(r.subjectId) +
        '<div class="grow"><div class="title">' + esc((subjById(r.subjectId) || {}).name || "Subject") + '</div><div class="sub">' + esc(r.note || "Extra class") + "</div></div>" +
        '<span class="pill ' + (r.status === "present" ? "good" : r.status === "absent" ? "bad" : "") + '">' + r.status + "</span></div>").join("") + "</div>" : "") +
    "</section>" +

    // subjects
    '<section class="section"><div class="section-head"><h2 class="h-md">Subjects</h2><span class="mono">' + plural(subs.length, "subject") + "</span></div>" +
      (subs.length ? '<div class="grid auto">' + subs.map(s => subjCard(d, s)).join("") + "</div>" :
        emptyState("No subjects yet", "Add the subjects you're taking this semester.", '<button class="btn sm" data-a="add-subject">+ Add a subject</button>')) +
      (archived.length ? '<p class="mono muted" style="margin-top:18px">Archived: ' + archived.map(s => '<a href="#" data-a="edit-subject" data-id="' + s.id + '">' + esc(s.name) + "</a>").join(" · ") + "</p>" : "") +
    "</section>" +

    // planner
    (subs.length ? '<section class="section"><div class="section-head"><h2 class="h-md">What-if planner</h2><span class="mono">Plan your bunks</span></div>' +
      '<div class="card"><div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
      '<label class="field"><span>Subject</span><select id="wi-sub"><option value="">All subjects</option>' + subs.map(s => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Classes I attend</span><input id="wi-a" type="number" min="0" max="300" value="0"></label>' +
      '<label class="field"><span>Classes I miss</span><input id="wi-m" type="number" min="0" max="300" value="3"></label></div>' +
      '<div id="wi-out" style="margin-top:22px"></div></div></section>' : "") +

    // history
    historySection(d) +
    "</div>";

  bindClassRows(root, d, viewDate);

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "add-subject") subjectForm(null);
    else if (a === "edit-subject") { e.preventDefault(); subjectForm(subjById(b.dataset.id)); }
    else if (a === "bulk") bulkForm();
    else if (a === "day-prev") { viewDate = addDays(viewDate, -1); ctx.refresh(); }
    else if (a === "day-next") { viewDate = addDays(viewDate, 1); ctx.refresh(); }
    else if (a === "day-today") { viewDate = t; ctx.refresh(); }
    else if (a === "mark-rest") markRemaining(viewDate, "present");
    else if (a === "extra") { const sel = root.querySelector("#extra-sub"); if (sel) mark(sel.value, b.dataset.st, viewDate); }
    else if (a === "edit-rec") recordForm(d.attendance.find(r => r.id === b.dataset.id));
    else if (a === "quick") mark(b.dataset.id, b.dataset.st, viewDate);
    else if (a === "cal-prev") { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } ctx.refresh(); }
    else if (a === "cal-next") { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } ctx.refresh(); }
    else if (a === "cal-day") { viewDate = b.dataset.date; scrollToDay = true; ctx.refresh(); }
    else if (a === "more") { filter.limit += 40; ctx.refresh(); }
  });
  root.addEventListener("change", e => {
    if (e.target.id === "att-date" && e.target.value) { viewDate = e.target.value; ctx.refresh(); }
    else if (e.target.id === "f-subject") { filter.subject = e.target.value; filter.limit = 40; ctx.refresh(); }
    else if (e.target.id === "f-status") { filter.status = e.target.value; filter.limit = 40; ctx.refresh(); }
  });

  // what-if planner
  const wiSub = root.querySelector("#wi-sub");
  if (wiSub) {
    const calc = () => {
      const a = Math.max(0, Math.floor(Number(root.querySelector("#wi-a").value) || 0));
      const m = Math.max(0, Math.floor(Number(root.querySelector("#wi-m").value) || 0));
      const s = wiSub.value ? d.subjects.find(x => x.id === wiSub.value) : null;
      const now = s ? subjectStats(d, s) : o;
      const target = s ? now.target : o.target;
      const after = attStats(now.present + a, now.absent + m, target);
      const vv = verdict(after);
      root.querySelector("#wi-out").innerHTML =
        '<div class="row" style="gap:28px;align-items:flex-end"><div><div class="mono muted">Now</div><div class="num" style="font-size:54px">' + (now.total ? esc(pct(now.percent)) + "%" : "—") + "</div></div>" +
        '<div class="h-md muted">→</div><div><div class="mono muted">After</div><div class="num ' + (after.total ? (after.ok ? "good" : "bad") : "") + '" style="font-size:54px">' + (after.total ? esc(pct(after.percent)) + "%" : "—") + "</div></div>" +
        '<div class="grow ' + vv.cls + '" style="min-width:220px">' + esc(vv.text) + ' <span class="muted">(target ' + target + "%)</span></div></div>";
    };
    ["#wi-sub", "#wi-a", "#wi-m"].forEach(sel => root.querySelector(sel).addEventListener("input", calc));
    calc();
  }

  if (scrollToDay) {
    scrollToDay = false;
    const el = root.querySelector("#day-sec");
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

function subjCard(d, s) {
  const st = subjectStats(d, s);
  const v = verdict(st);
  const risk = st.total >= 3 ? (!st.ok ? " risk-bad" : st.canSkip === 0 ? " risk-warn" : "") : "";
  return '<div class="card subj-card' + risk + '">' +
    '<div class="spread"><span class="row" style="gap:8px"><i class="dot" style="--c:' + esc(s.color) + '"></i><span class="mono muted">' + esc(s.code || "Subject") + "</span></span>" +
    '<button class="btn xs ghost" data-a="edit-subject" data-id="' + s.id + '">Edit</button></div>' +
    '<div><div class="h-sm">' + esc(s.name) + "</div>" + (s.faculty ? '<div class="muted" style="font-size:13px">' + esc(s.faculty) + "</div>" : "") + "</div>" +
    '<div class="num pct ' + (st.total ? (st.ok ? "good" : "bad") : "faint") + '">' + (st.total ? esc(pct(st.percent)) + "%" : "—") + "</div>" +
    '<div class="bar"><i class="' + (st.ok ? "good" : "bad") + '" style="width:' + (st.percent || 0) + '%"></i><b style="left:' + st.target + '%"></b></div>' +
    '<div class="counts"><span>' + st.present + " present</span><span>" + st.absent + " absent</span>" + (st.cancelled ? "<span>" + st.cancelled + " cancelled</span>" : "") + "<span>target " + st.target + "%</span></div>" +
    '<div class="verdict ' + v.cls + '">' + esc(v.text) + "</div>" +
    '<div class="row"><button class="btn xs good-b" data-a="quick" data-st="present" data-id="' + s.id + '">+ Present</button><button class="btn xs bad-b" data-a="quick" data-st="absent" data-id="' + s.id + '">+ Absent</button></div></div>';
}

function historySection(d) {
  const first = new Date(cal.y, cal.m, 1);
  const days = new Date(cal.y, cal.m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const ym = cal.y + "-" + String(cal.m + 1).padStart(2, "0");
  const byDate = {};
  d.attendance.forEach(r => { if (r.date.startsWith(ym)) (byDate[r.date] = byDate[r.date] || []).push(r); });
  const t = today();
  let cells = DAYS.map(x => '<div class="h mono muted">' + x + "</div>").join("") + '<div class="d blank"></div>'.repeat(offset);
  for (let i = 1; i <= days; i++) {
    const ds = ym + "-" + String(i).padStart(2, "0");
    const recs = byDate[ds] || [];
    cells += '<div class="d' + (ds === t ? " today" : "") + '" data-a="cal-day" data-date="' + ds + '" title="' + esc(fmtDate(ds)) + '"><div class="n">' + i + '</div><div class="dots">' +
      recs.slice(0, 8).map(r => '<i class="st-' + r.status + '"></i>').join("") + "</div></div>";
  }
  let recs = d.attendance.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (filter.subject) recs = recs.filter(r => r.subjectId === filter.subject);
  if (filter.status) recs = recs.filter(r => r.status === filter.status);
  const shown = recs.slice(0, filter.limit);
  return '<section class="section"><div class="section-head"><h2 class="h-md">History</h2><span class="mono">' + plural(d.attendance.length, "record") + "</span></div>" +
    '<div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start">' +
    '<div><div class="spread" style="margin-bottom:12px"><button class="btn sm icon ghost" data-a="cal-prev" aria-label="Previous month">←</button><span class="h-sm">' + MONTHS[cal.m] + " " + cal.y +
    '</span><button class="btn sm icon ghost" data-a="cal-next" aria-label="Next month">→</button></div><div class="cal">' + cells + "</div>" +
    '<div class="legend"><span><i class="st-present"></i>Present</span><span><i class="st-absent"></i>Absent</span><span><i class="st-cancelled"></i>Cancelled</span></div></div>' +
    '<div><div class="row" style="margin-bottom:12px"><select id="f-subject" style="width:auto"><option value="">All subjects</option>' +
    d.subjects.map(s => '<option value="' + s.id + '"' + (filter.subject === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") + "</select>" +
    '<select id="f-status" style="width:auto"><option value="">Any status</option>' +
    ["present", "absent", "cancelled"].map(x => '<option value="' + x + '"' + (filter.status === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></div>" +
    (shown.length ? '<div class="list">' + shown.map(r =>
      '<div class="item" data-a="edit-rec" data-id="' + r.id + '" style="cursor:pointer"><span class="mono muted" style="width:96px;flex:none">' + esc(fmtDate(r.date)) + "</span>" +
      '<div class="grow"><div class="title">' + esc((subjById(r.subjectId) || {}).name || "Deleted subject") + "</div>" + (r.note && r.note !== "bulk" ? '<div class="sub">' + esc(r.note) + "</div>" : "") + "</div>" +
      '<span class="pill ' + (r.status === "present" ? "good" : r.status === "absent" ? "bad" : "") + '">' + r.status + "</span></div>").join("") + "</div>" +
      (recs.length > shown.length ? '<div style="margin-top:14px"><button class="btn sm" data-a="more">Show more (' + (recs.length - shown.length) + " left)</button></div>" : "")
      : emptyState("No records", "Marked classes appear here.", "")) +
    "</div></div></section>";
}
