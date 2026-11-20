import { esc, today, daysBetween, fmtDate, fmtTime, pct, plural } from "../ui.js";
import { examForm, subjById } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

export function render(root, d) {
  const t = today();
  const up = d.exams.filter(e => e.date >= t).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const past = d.exams.filter(e => e.date < t).sort((a, b) => b.date.localeCompare(a.date));
  const scored = d.exams.filter(e => e.score != null && e.maxScore);
  const avg = scored.length ? scored.reduce((s, e) => s + e.score / e.maxScore * 100, 0) / scored.length : null;
  const next = up[0];

  root.innerHTML = '<div class="page">' +
    pageHead("05", "Exams", '<button class="btn solid" data-a="add">+ Add exam</button>', "Schedule & results") +
    '<div class="grid g3 fade-up" style="--d:.2s">' +
      '<div class="card invert stat"><div class="label mono" style="color:inherit;opacity:.6">Next exam</div><div class="num">' + (next ? daysLabel(daysBetween(t, next.date)) : "—") + '</div><div class="foot" style="color:inherit;opacity:.7">' + esc(next ? (nameOf(next)) : "Nothing scheduled") + "</div></div>" +
      '<div class="card stat"><div class="label mono">Upcoming</div><div class="num">' + up.length + '</div><div class="foot">' + plural(past.length, "past exam") + "</div></div>" +
      '<div class="card stat"><div class="label mono">Average score</div><div class="num">' + (avg == null ? "—" : esc(pct(avg)) + '<span class="faint" style="font-size:.4em">%</span>') + '</div><div class="foot">' + (scored.length ? "across " + plural(scored.length, "scored exam") : "Add scores after results") + "</div></div></div>" +
    '<section class="section"><div class="section-head"><h2 class="h-md">Upcoming</h2><span class="mono">' + up.length + "</span></div>" +
      (up.length ? '<div class="list">' + up.map(e => {
        const n = daysBetween(t, e.date);
        return '<div class="item" data-a="edit" data-id="' + e.id + '" style="cursor:pointer;gap:22px"><div style="width:86px;flex:none"><div class="num ' + (n <= 3 ? "warn" : "") + '" style="font-size:44px">' + n + '</div><div class="mono muted">' + (n === 1 ? "day" : "days") + "</div></div>" +
          '<div class="grow"><div class="title" style="font-size:18px">' + esc(nameOf(e)) + '</div><div class="sub">' + esc([e.kind, fmtDate(e.date), e.time && fmtTime(e.time), e.room].filter(Boolean).join(" · ")) + "</div>" +
          (e.syllabus ? '<div class="sub" style="margin-top:4px">' + esc(e.syllabus.slice(0, 140)) + "</div>" : "") + "</div></div>";
      }).join("") + "</div>" : emptyState("No exams scheduled", "Add quizzes, mid-sems and finals to get countdowns.", '<button class="btn sm" data-a="add">+ Add exam</button>')) +
    "</section>" +
    (past.length ? '<section class="section"><div class="section-head"><h2 class="h-md">Past</h2><span class="mono">' + past.length + '</span></div><div class="list">' + past.map(e => {
      const has = e.score != null && e.maxScore;
      return '<div class="item" data-a="edit" data-id="' + e.id + '" style="cursor:pointer"><span class="mono muted" style="width:96px;flex:none">' + esc(fmtDate(e.date)) + '</span><div class="grow"><div class="title">' + esc(nameOf(e)) + '</div><div class="sub">' + esc(e.kind || "") + "</div></div>" +
        (has ? '<span class="num ' + (e.score / e.maxScore >= .6 ? "good" : "bad") + '" style="font-size:26px">' + esc(e.score + "/" + e.maxScore) + "</span>" : '<span class="pill">Add score</span>') + "</div>";
    }).join("") + "</div></section>" : "") +
    "</div>";

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    if (b.dataset.a === "add") examForm(null);
    else if (b.dataset.a === "edit") examForm(d.exams.find(x => x.id === b.dataset.id));
  });
}

function nameOf(e) {
  const s = subjById(e.subjectId);
  return (s ? s.name : "") + (e.title ? (s ? " — " : "") + e.title : "") || e.kind || "Exam";
}
function daysLabel(n) { return n === 0 ? "Today" : n + (n === 1 ? " day" : " days"); }
