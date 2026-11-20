import { esc, today, daysBetween, relDay, plural } from "../ui.js";
import { store, update } from "../store.js";
import { taskForm, toggleTask, subjById, subjectTag } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

let view = "open"; // open | done | all

export function render(root, d, ctx) {
  const t = today();
  const open = d.tasks.filter(x => !x.done);
  const done = d.tasks.filter(x => x.done);
  const overdue = open.filter(x => x.due && x.due < t);
  const pctDone = d.tasks.length ? Math.round(done.length / d.tasks.length * 100) : 0;

  const prio = { High: 0, Medium: 1, Low: 2 };
  const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (prio[a.priority] - prio[b.priority]);

  let groups = [];
  if (view !== "done") {
    const g = { "Overdue": [], "Today": [], "This week": [], "Later": [], "No date": [] };
    open.slice().sort(byDue).forEach(x => {
      if (!x.due) g["No date"].push(x);
      else if (x.due < t) g["Overdue"].push(x);
      else if (x.due === t) g["Today"].push(x);
      else if (daysBetween(t, x.due) <= 7) g["This week"].push(x);
      else g["Later"].push(x);
    });
    groups = Object.entries(g).filter(e => e[1].length);
  }
  if (view !== "open" && done.length) groups.push(["Completed", done.slice().sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""))]);

  root.innerHTML = '<div class="page">' +
    pageHead("04", "Tasks", '<button class="btn solid" data-a="add">+ New task</button>', "Assignments & to-dos") +
    '<div class="grid g3 fade-up" style="--d:.2s;margin-bottom:clamp(28px,4vw,48px)">' +
      '<div class="card stat"><div class="label mono">Open</div><div class="num">' + open.length + '</div></div>' +
      '<div class="card stat"><div class="label mono">Overdue</div><div class="num ' + (overdue.length ? "bad" : "") + '">' + overdue.length + '</div></div>' +
      '<div class="card stat"><div class="label mono">Completed</div><div class="num">' + pctDone + '<span class="faint" style="font-size:.4em">%</span></div><div class="bar" style="margin-top:14px"><i style="width:' + pctDone + '%"></i></div></div></div>' +
    '<div class="spread" style="margin-bottom:8px"><div class="seg">' +
      [["open", "Open"], ["done", "Done"], ["all", "All"]].map(v => '<button data-a="view" data-v="' + v[0] + '" class="' + (view === v[0] ? "on" : "") + '">' + v[1] + "</button>").join("") + "</div>" +
      (done.length ? '<button class="btn sm ghost" data-a="clear">Clear completed</button>' : "") + "</div>" +
    (groups.length ? groups.map(g =>
      '<section class="section" style="margin-top:28px"><div class="section-head"><h2 class="h-sm ' + (g[0] === "Overdue" ? "bad" : "") + '">' + g[0] + '</h2><span class="mono">' + g[1].length + '</span></div><div class="list">' +
      g[1].map(row).join("") + "</div></section>").join("") :
      emptyState(view === "done" ? "Nothing completed yet" : "You're all caught up", view === "done" ? "Tick off tasks and they land here." : "Add assignments, lab records and revision goals.", '<button class="btn sm" data-a="add">+ New task</button>')) +
    "</div>";

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "add") taskForm(null);
    else if (a === "toggle") toggleTask(b.dataset.id);
    else if (a === "edit") taskForm(d.tasks.find(x => x.id === b.dataset.id));
    else if (a === "view") { view = b.dataset.v; ctx.refresh(); }
    else if (a === "clear") {
      if (confirm("Delete all " + done.length + " completed tasks?")) update(dd => { dd.tasks = dd.tasks.filter(x => !x.done); });
    }
  });
}

function row(x) {
  const t = today();
  const s = subjById(x.subjectId);
  const days = x.due ? daysBetween(t, x.due) : null;
  return '<div class="item' + (x.done ? " done" : "") + '"><input type="checkbox" data-a="toggle" data-id="' + x.id + '"' + (x.done ? " checked" : "") + ' aria-label="Mark done">' +
    '<div class="grow" data-a="edit" data-id="' + x.id + '" style="cursor:pointer"><div class="title">' + esc(x.title) + '</div><div class="sub">' +
    esc([x.kind, s && s.name, x.notes].filter(Boolean).join(" · ")) + "</div></div>" +
    (x.due && !x.done ? '<span class="mono ' + (days < 0 ? "bad" : days <= 1 ? "warn" : "muted") + '">' + esc(relDay(x.due)) + "</span>" : "") +
    (x.priority === "High" && !x.done ? '<span class="pill bad">High</span>' : x.priority === "Low" && !x.done ? '<span class="pill">Low</span>' : "") + "</div>";
}
