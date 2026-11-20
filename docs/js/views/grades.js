import { esc, plural } from "../ui.js";
import { store, update, uid } from "../store.js";
import { openForm, toast } from "../ui.js";
import { SCALES, semesterGPA, cgpa } from "../calc.js";
import { pageHead, emptyState } from "./common.js";

const fmt = n => n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2);

function semesterForm(sem) {
  openForm({
    eyebrow: sem ? "Edit semester" : "New semester", title: sem ? sem.name : "Add a semester",
    fields: [{ name: "name", label: "Name", required: true, full: true, value: sem && sem.name, placeholder: "e.g. Semester 3", maxlength: 60 }],
    onSubmit: v => update(d => {
      if (sem) d.semesters.find(s => s.id === sem.id).name = v.name;
      else d.semesters.push({ id: uid(), name: v.name, courses: [] });
    }),
    onDelete: sem ? () => { if (confirm('Delete "' + sem.name + '" and its courses?')) update(d => { d.semesters = d.semesters.filter(s => s.id !== sem.id); }); } : null,
  });
}

function courseForm(sem, course) {
  const scale = SCALES[store.data.profile.gradeScale] || SCALES["10"];
  const c = course || {};
  openForm({
    eyebrow: sem.name, title: course ? "Edit course" : "Add a course",
    fields: [
      { name: "name", label: "Course", required: true, full: true, value: c.name, maxlength: 120 },
      { name: "credits", label: "Credits", type: "number", min: 0, max: 30, step: 0.5, value: c.credits ?? 3, required: true },
      { name: "grade", label: "Grade", type: "select", value: c.grade || "", options: [{ value: "", label: "— in progress —" }].concat(scale.grades.map(g => ({ value: g[0], label: g[0] + " (" + g[1] + ")" }))) },
    ],
    onSubmit: v => update(d => {
      const s = d.semesters.find(x => x.id === sem.id);
      if (course) Object.assign(s.courses.find(x => x.id === course.id), v);
      else s.courses.push(Object.assign({ id: uid() }, v));
    }),
    onDelete: course ? () => update(d => { const s = d.semesters.find(x => x.id === sem.id); s.courses = s.courses.filter(x => x.id !== course.id); }) : null,
  });
}

export function render(root, d) {
  const scaleKey = d.profile.gradeScale in SCALES ? d.profile.gradeScale : "10";
  const scale = SCALES[scaleKey];
  const all = cgpa(scaleKey, d.semesters);

  root.innerHTML = '<div class="page">' +
    pageHead("06", "Grades", '<div class="seg">' + Object.keys(SCALES).map(k => '<button data-a="scale" data-k="' + k + '" class="' + (k === scaleKey ? "on" : "") + '">' + (k === "10" ? "10-point" : "4-point") + "</button>").join("") +
      '</div><button class="btn solid" data-a="add-sem">+ Semester</button>', "GPA & CGPA") +
    '<section class="att-hero fade-up" style="--d:.2s"><div class="num big">' + fmt(all.gpa) + '</div><div class="stack" style="gap:10px;padding-bottom:1vw"><div class="h-md">Cumulative GPA</div>' +
      '<div class="muted">out of ' + scale.max + " · " + plural(all.credits, "credit") + " · " + plural(d.semesters.length, "semester") + "</div></div></section>" +
    (d.semesters.length ? '<section class="section"><div class="grid auto" style="grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))">' + d.semesters.map(s => {
      const g = semesterGPA(scaleKey, s);
      return '<div class="card"><div class="spread" style="margin-bottom:14px"><div><div class="mono muted">GPA ' + fmt(g.gpa) + " · " + plural(g.credits, "credit") + '</div><div class="h-md" style="margin-top:6px">' + esc(s.name) + "</div></div>" +
        '<button class="btn xs ghost" data-a="edit-sem" data-id="' + s.id + '">Edit</button></div>' +
        (s.courses.length ? '<div class="list">' + s.courses.map(c =>
          '<div class="item" data-a="edit-course" data-sem="' + s.id + '" data-id="' + c.id + '" style="cursor:pointer;padding:10px 4px"><div class="grow">' + esc(c.name) + '</div><span class="mono muted">' + esc(c.credits) + ' cr</span><span class="h-sm" style="width:34px;text-align:right">' + esc(c.grade || "—") + "</span></div>").join("") + "</div>" : '<p class="muted" style="margin:0 0 6px">No courses yet.</p>') +
        '<div class="row" style="margin-top:14px"><button class="btn xs" data-a="add-course" data-id="' + s.id + '">+ Course</button>' +
        (d.subjects.some(x => !x.archived) && !s.courses.length ? '<button class="btn xs ghost" data-a="import" data-id="' + s.id + '">Import current subjects</button>' : "") + "</div></div>";
    }).join("") + "</div></section>" :
      '<section class="section">' + emptyState("No semesters yet", "Add a semester, then its courses and grades — your CGPA is calculated for you.", '<button class="btn sm" data-a="add-sem">+ Add semester</button>') + "</section>") +
    '<section class="section"><div class="section-head"><h2 class="h-md">Target planner</h2><span class="mono">What GPA do I need?</span></div><div class="card">' +
      '<div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label class="field"><span>Target CGPA</span><input id="tp-t" type="number" min="0" max="' + scale.max + '" step="0.01" value="' + (scale.max === 10 ? 8.5 : 3.5) + '"></label>' +
      '<label class="field"><span>Credits still to take</span><input id="tp-c" type="number" min="1" max="300" value="24"></label></div><div id="tp-out" style="margin-top:20px"></div></div></section></div>';

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "scale") update(dd => { dd.profile.gradeScale = b.dataset.k; });
    else if (a === "add-sem") semesterForm(null);
    else if (a === "edit-sem") semesterForm(d.semesters.find(s => s.id === b.dataset.id));
    else if (a === "add-course") courseForm(d.semesters.find(s => s.id === b.dataset.id), null);
    else if (a === "edit-course") { const s = d.semesters.find(x => x.id === b.dataset.sem); courseForm(s, s.courses.find(c => c.id === b.dataset.id)); }
    else if (a === "import") {
      update(dd => {
        const s = dd.semesters.find(x => x.id === b.dataset.id);
        dd.subjects.filter(x => !x.archived).forEach(x => s.courses.push({ id: uid(), name: x.name, credits: x.credits || 3, grade: "" }));
      });
      toast("Subjects imported — add the grades as they come");
    }
  });

  const out = root.querySelector("#tp-out");
  const calc = () => {
    const target = Number(root.querySelector("#tp-t").value), cr = Number(root.querySelector("#tp-c").value);
    if (!(cr > 0) || !isFinite(target)) { out.innerHTML = ""; return; }
    const need = (target * (all.credits + cr) - all.points) / cr;
    const cls = need > scale.max ? "bad" : need <= 0 ? "good" : "";
    out.innerHTML = '<div class="row" style="gap:20px;align-items:flex-end"><div class="num ' + cls + '" style="font-size:64px">' + (need <= 0 ? "Any" : fmt(need)) + '</div><div class="muted" style="max-width:46ch">' +
      (need > scale.max ? "Not reachable in that many credits — even a perfect " + scale.max + " average falls short. Try more credits or a lower target."
        : need <= 0 ? "You've already locked in that CGPA."
        : "average GPA needed over the next " + plural(cr, "credit") + " to reach a CGPA of " + fmt(target) + ".") + "</div></div>";
  };
  root.querySelector("#tp-t").addEventListener("input", calc);
  root.querySelector("#tp-c").addEventListener("input", calc);
  calc();
}
