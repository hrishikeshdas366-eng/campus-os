import { esc, today, weekday, nowMinutes, toMin, fmtTime, DAYS, DAYS_LONG, plural } from "../ui.js";
import { classForm, subjectForm } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

export function render(root, d) {
  const subs = d.subjects.filter(s => !s.archived);
  const active = new Set(subs.map(s => s.id));
  const wdToday = weekday(today());
  const mins = nowMinutes();
  const entries = d.timetable.filter(e => active.has(e.subjectId));

  const cols = DAYS_LONG.map((name, i) => {
    const list = entries.filter(e => e.day === i).sort((a, b) => (toMin(a.start) ?? 9999) - (toMin(b.start) ?? 9999));
    return '<div class="col' + (i === wdToday ? " today" : "") + '"><div class="col-head"><span class="mono">' + DAYS[i] +
      '</span><button class="btn xs ghost" data-a="add" data-day="' + i + '" aria-label="Add class on ' + name + '">+</button></div>' +
      (list.length ? list.map(e => {
        const s = subjById(d, e.subjectId);
        const now = i === wdToday && toMin(e.start) <= mins && mins < (toMin(e.end) ?? toMin(e.start) + 60);
        return '<div class="slot' + (now ? " now" : "") + '" style="--c:' + esc(s ? s.color : "") + '" data-a="edit" data-id="' + e.id + '">' +
          '<div class="t">' + esc(fmtTime(e.start)) + (e.end ? "–" + esc(fmtTime(e.end)) : "") + '</div><div class="n">' + esc(s ? s.name : "Subject") +
          '</div><div class="r">' + esc([e.kind, e.room].filter(Boolean).join(" · ")) + "</div></div>";
      }).join("") : '<div class="faint" style="font-size:12px;padding:6px 2px">Free</div>') + "</div>";
  }).join("");

  // weekly load per subject
  const load = subs.map(s => {
    const mine = entries.filter(e => e.subjectId === s.id);
    let m = 0;
    mine.forEach(e => { const a = toMin(e.start), b = toMin(e.end); if (a != null && b != null && b > a) m += b - a; });
    return { s, n: mine.length, hours: m / 60 };
  });

  root.innerHTML = '<div class="page">' +
    pageHead("03", "Timetable", '<button class="btn" data-a="add-subject">+ Subject</button><button class="btn solid" data-a="add">+ Add class</button>', "Your week") +
    (subs.length ? '<div class="week fade-up" style="--d:.2s">' + cols + "</div>" :
      emptyState("Add subjects first", "Your timetable is built from your subjects.", '<button class="btn sm" data-a="add-subject">+ Add a subject</button>')) +
    (subs.length ? '<section class="section"><div class="section-head"><h2 class="h-md">Weekly load</h2><span class="mono">' + plural(entries.length, "class", "classes") + " / week</span></div>" +
      '<div class="grid auto">' + load.map(l => '<div class="card row" style="gap:14px"><span class="swatch" style="--c:' + esc(l.s.color) + ';align-self:stretch"></span><div class="grow"><div class="title" style="font-weight:600">' +
        esc(l.s.name) + '</div><div class="muted" style="font-size:13px">' + plural(l.n, "slot") + (l.hours ? " · " + (Math.round(l.hours * 10) / 10) + " h" : "") + '</div></div><button class="btn xs ghost" data-a="edit-subject" data-id="' + l.s.id + '">Edit</button></div>').join("") + "</div></section>" : "") +
    "</div>";

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "add") classForm(null, b.dataset.day != null ? { day: Number(b.dataset.day) } : null);
    else if (a === "edit") classForm(d.timetable.find(x => x.id === b.dataset.id));
    else if (a === "add-subject") subjectForm(null);
    else if (a === "edit-subject") subjectForm(d.subjects.find(x => x.id === b.dataset.id));
  });
}

function subjById(d, id) { return d.subjects.find(s => s.id === id); }
