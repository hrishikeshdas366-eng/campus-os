// Actions shared across views (forms + mutations)
import { store, update, uid } from "./store.js";
import { openForm, toast, subjectOptions, today, DAYS_LONG, PALETTE, esc } from "./ui.js";

const D = () => store.data;
export const subjById = id => D().subjects.find(s => s.id === id);

// ---------- subjects ----------
export function subjectForm(subj, after) {
  const d = D();
  openForm({
    eyebrow: subj ? "Edit subject" : "New subject",
    title: subj ? subj.name : "Add a subject",
    fields: [
      { name: "name", label: "Subject name", required: true, full: true, value: subj?.name, placeholder: "e.g. Data Structures", maxlength: 120 },
      { name: "code", label: "Course code", value: subj?.code, placeholder: "e.g. CS201", maxlength: 40 },
      { name: "faculty", label: "Faculty", value: subj?.faculty, placeholder: "e.g. Dr. Rao", maxlength: 80 },
      { name: "credits", label: "Credits", type: "number", min: 0, max: 30, step: 0.5, value: subj?.credits ?? "" },
      { name: "target", label: "Attendance target % (blank = default " + d.profile.target + "%)", type: "number", min: 1, max: 100, step: 0.5, value: subj?.target ?? "" },
      { name: "color", label: "Colour", type: "color", value: subj?.color || PALETTE[d.subjects.length % PALETTE.length] },
      { name: "archived", label: "Archived (past semester — hidden from daily views)", type: "checkbox", value: subj?.archived, full: true },
    ],
    onSubmit: v => {
      update(dd => {
        if (subj) {
          const s = dd.subjects.find(x => x.id === subj.id);
          Object.assign(s, v);
        } else {
          dd.subjects.push(Object.assign({ id: uid() }, v));
        }
      });
      toast(subj ? "Subject updated" : "Subject added — now add its classes to your timetable");
      if (after) after();
    },
    onDelete: subj ? () => deleteSubject(subj) : null,
  });
}

export function deleteSubject(subj) {
  const d = D();
  const n = d.attendance.filter(r => r.subjectId === subj.id).length;
  if (!confirm('Delete "' + subj.name + '"' + (n ? " and its " + n + " attendance records" : "") +
    "? Timetable classes for it are removed too.\n\nTip: tick “Archived” instead to keep its history.")) return;
  update(dd => {
    dd.subjects = dd.subjects.filter(s => s.id !== subj.id);
    dd.attendance = dd.attendance.filter(r => r.subjectId !== subj.id);
    dd.timetable = dd.timetable.filter(t => t.subjectId !== subj.id);
    ["tasks", "exams", "notes", "focus", "links"].forEach(k => dd[k].forEach(x => { if (x.subjectId === subj.id) x.subjectId = ""; }));
  });
  toast("Subject deleted");
}

// ---------- timetable ----------
export function classForm(entry, preset) {
  const d = D();
  if (!d.subjects.filter(s => !s.archived).length) {
    toast("Add a subject first");
    return subjectForm(null);
  }
  const e = entry || Object.assign({ day: 0, start: "09:00", end: "10:00", kind: "Lecture" }, preset || {});
  openForm({
    eyebrow: entry ? "Edit class" : "New class",
    title: entry ? "Edit timetable slot" : "Add a class to your week",
    fields: [
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects), value: e.subjectId, required: true, full: true },
      { name: "day", label: "Day", type: "select", options: DAYS_LONG.map((l, i) => ({ value: i, label: l })), value: e.day },
      { name: "kind", label: "Type", type: "select", options: ["Lecture", "Lab", "Tutorial", "Seminar", "Practical"].map(x => ({ value: x, label: x })), value: e.kind },
      { name: "start", label: "Starts", type: "time", value: e.start, required: true },
      { name: "end", label: "Ends", type: "time", value: e.end },
      { name: "room", label: "Room / location", value: e.room, full: true, placeholder: "e.g. Block B · 204", maxlength: 60 },
    ],
    onSubmit: v => {
      v.day = Number(v.day);
      update(dd => {
        if (entry) Object.assign(dd.timetable.find(t => t.id === entry.id), v);
        else dd.timetable.push(Object.assign({ id: uid() }, v));
      });
      toast(entry ? "Class updated" : "Class added to " + DAYS_LONG[v.day]);
    },
    onDelete: entry ? () => { update(dd => { dd.timetable = dd.timetable.filter(t => t.id !== entry.id); }); toast("Class removed"); } : null,
  });
}

// ---------- attendance ----------
export function mark(subjectId, status, date, opts) {
  const id = uid();
  const rec = { id, subjectId, date: date || today(), status, note: "", slotId: opts?.slotId || "" };
  update(dd => dd.attendance.push(rec));
  if (opts?.silent) return id;
  const s = subjById(subjectId);
  toast((s ? s.name : "Class") + " · " + status, {
    action: { label: "Undo", run: () => update(dd => { dd.attendance = dd.attendance.filter(r => r.id !== id); }) },
  });
  return id;
}

export function unmark(recordId) {
  update(dd => { dd.attendance = dd.attendance.filter(r => r.id !== recordId); });
}

export function recordForm(rec) {
  const d = D();
  openForm({
    eyebrow: "Attendance record",
    title: (subjById(rec.subjectId)?.name || "Record"),
    fields: [
      { name: "date", label: "Date", type: "date", value: rec.date, required: true },
      { name: "status", label: "Status", type: "select", value: rec.status, options: [{ value: "present", label: "Present" }, { value: "absent", label: "Absent" }, { value: "cancelled", label: "Cancelled (doesn't count)" }] },
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects.filter(s => !s.archived || s.id === rec.subjectId)), value: rec.subjectId, full: true },
      { name: "note", label: "Note", value: rec.note, full: true, maxlength: 200, placeholder: "optional" },
    ],
    onSubmit: v => { update(dd => Object.assign(dd.attendance.find(r => r.id === rec.id), v)); toast("Record updated"); },
    onDelete: () => {
      update(dd => { dd.attendance = dd.attendance.filter(r => r.id !== rec.id); });
      toast("Record deleted", { action: { label: "Undo", run: () => update(dd => dd.attendance.push(rec)) } });
    },
  });
}

/** Add many past classes at once (e.g. catching up on the semester so far). */
export function bulkForm() {
  const d = D();
  if (!d.subjects.filter(s => !s.archived).length) return subjectForm(null);
  openForm({
    eyebrow: "Catch up",
    title: "Add past attendance in bulk",
    fields: [
      { name: "html", type: "html", full: true, html: '<p class="muted" style="margin:0">Starting mid-semester? Enter your totals so far — they’re added as records dated below.</p>' },
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects), full: true },
      { name: "present", label: "Classes attended", type: "number", min: 0, max: 500, value: 0 },
      { name: "absent", label: "Classes missed", type: "number", min: 0, max: 500, value: 0 },
      { name: "date", label: "Date to file them under", type: "date", value: today(), full: true },
    ],
    submitLabel: "Add records",
    onSubmit: v => {
      const p = Math.max(0, Math.floor(v.present || 0)), a = Math.max(0, Math.floor(v.absent || 0));
      if (!p && !a) { toast("Enter at least one class"); return false; }
      update(dd => {
        for (let i = 0; i < p; i++) dd.attendance.push({ id: uid(), subjectId: v.subjectId, date: v.date, status: "present", note: "bulk" });
        for (let i = 0; i < a; i++) dd.attendance.push({ id: uid(), subjectId: v.subjectId, date: v.date, status: "absent", note: "bulk" });
      });
      toast("Added " + (p + a) + " records");
    },
  });
}

// ---------- tasks ----------
export function taskForm(task, preset) {
  const d = D();
  const t = task || Object.assign({ kind: "Assignment", priority: "Medium", due: "" }, preset || {});
  openForm({
    eyebrow: task ? "Edit task" : "New task",
    title: task ? "Edit task" : "What needs doing?",
    fields: [
      { name: "title", label: "Title", required: true, full: true, value: t.title, placeholder: "e.g. DBMS assignment 3", maxlength: 160 },
      { name: "kind", label: "Type", type: "select", value: t.kind, options: ["Assignment", "Project", "Lab record", "Reading", "Revision", "Personal", "Other"].map(x => ({ value: x, label: x })) },
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects, true), value: t.subjectId || "" },
      { name: "due", label: "Due date", type: "date", value: t.due },
      { name: "priority", label: "Priority", type: "select", value: t.priority, options: ["High", "Medium", "Low"].map(x => ({ value: x, label: x })) },
      { name: "notes", label: "Details", type: "textarea", rows: 3, value: t.notes, full: true },
    ],
    onSubmit: v => {
      update(dd => {
        if (task) Object.assign(dd.tasks.find(x => x.id === task.id), v);
        else dd.tasks.push(Object.assign({ id: uid(), done: false, created: today() }, v));
      });
      toast(task ? "Task updated" : "Task added");
    },
    onDelete: task ? () => {
      update(dd => { dd.tasks = dd.tasks.filter(x => x.id !== task.id); });
      toast("Task deleted", { action: { label: "Undo", run: () => update(dd => dd.tasks.push(task)) } });
    } : null,
  });
}

export function toggleTask(id) {
  update(dd => {
    const t = dd.tasks.find(x => x.id === id);
    t.done = !t.done;
    t.doneAt = t.done ? today() : "";
  });
}

// ---------- notes ----------
export function noteForm(note, preset) {
  const d = D();
  const n = note || Object.assign({}, preset || {});
  openForm({
    eyebrow: note ? "Edit note" : "New note",
    title: note ? (note.title || "Untitled") : "Write it down",
    fields: [
      { name: "title", label: "Title", full: true, value: n.title, maxlength: 160, placeholder: "e.g. Unit 2 — Normalisation" },
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects, true), value: n.subjectId || "" },
      { name: "pinned", label: "Pin to top", type: "checkbox", value: n.pinned },
      { name: "body", label: "Note", type: "textarea", rows: 12, value: n.body, full: true, placeholder: "Write anything…" },
      { type: "html", full: true, html: '<button type="button" class="btn sm" id="ai-sum">✦ Summarise with AI</button><div id="ai-out" style="margin-top:10px"></div>' },
    ],
    onMount: form => {
      form.querySelector("#ai-sum").onclick = () => import("./aiui.js").then(m => m.summariseNote(
        () => form.elements.title.value, () => form.elements.body.value, add => { form.elements.body.value += add; }));
    },
    onSubmit: v => {
      if (!v.title && !v.body) { toast("Note is empty"); return false; }
      update(dd => {
        const stamp = new Date().toISOString();
        if (note) Object.assign(dd.notes.find(x => x.id === note.id), v, { updated: stamp });
        else dd.notes.push(Object.assign({ id: uid(), updated: stamp }, v));
      });
      toast(note ? "Note saved" : "Note added");
    },
    onDelete: note ? () => {
      update(dd => { dd.notes = dd.notes.filter(x => x.id !== note.id); });
      toast("Note deleted", { action: { label: "Undo", run: () => update(dd => dd.notes.push(note)) } });
    } : null,
  });
}

// ---------- exams ----------
export function examForm(exam) {
  const d = D();
  const e = exam || { kind: "Mid-sem" };
  openForm({
    eyebrow: exam ? "Edit exam" : "New exam",
    title: exam ? (exam.title || "Exam") : "Add an exam",
    fields: [
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects, true, "— Other —"), value: e.subjectId || "", full: true },
      { name: "title", label: "Title", value: e.title, placeholder: "e.g. Mid-semester exam", maxlength: 120, full: true },
      { name: "kind", label: "Type", type: "select", value: e.kind, options: ["Quiz", "Internal", "Mid-sem", "End-sem", "Practical", "Viva", "Other"].map(x => ({ value: x, label: x })) },
      { name: "date", label: "Date", type: "date", value: e.date, required: true },
      { name: "time", label: "Time", type: "time", value: e.time },
      { name: "room", label: "Room / seat", value: e.room, maxlength: 60 },
      { name: "syllabus", label: "Syllabus / portions", type: "textarea", rows: 3, value: e.syllabus, full: true },
      { name: "score", label: "Your score (after results)", type: "number", min: 0, step: 0.25, value: e.score ?? "" },
      { name: "maxScore", label: "Out of", type: "number", min: 0, step: 0.25, value: e.maxScore ?? "" },
    ],
    onSubmit: v => {
      update(dd => {
        if (exam) Object.assign(dd.exams.find(x => x.id === exam.id), v);
        else dd.exams.push(Object.assign({ id: uid() }, v));
      });
      toast(exam ? "Exam updated" : "Exam added");
    },
    onDelete: exam ? () => { update(dd => { dd.exams = dd.exams.filter(x => x.id !== exam.id); }); toast("Exam deleted"); } : null,
  });
}

// ---------- money ----------
export const CATEGORIES = ["Food", "Transport", "Books & supplies", "Rent & hostel", "Fees", "Mobile & internet", "Fun", "Shopping", "Health", "Other"];
export function moneyForm(entry, kind) {
  const d = D();
  const e = entry || { kind: kind || "expense", date: today(), category: "Food" };
  openForm({
    eyebrow: entry ? "Edit entry" : (e.kind === "income" ? "Money in" : "Money out"),
    title: entry ? "Edit entry" : (e.kind === "income" ? "Add income" : "Add expense"),
    fields: [
      { name: "amount", label: "Amount (" + d.settings.currency + ")", type: "number", min: 0, step: 0.01, value: e.amount ?? "", required: true },
      { name: "kind", label: "Type", type: "select", value: e.kind, options: [{ value: "expense", label: "Expense" }, { value: "income", label: "Income / pocket money" }] },
      { name: "category", label: "Category", type: "select", value: e.category, options: CATEGORIES.concat(["Pocket money", "Scholarship", "Part-time job"]).map(x => ({ value: x, label: x })) },
      { name: "date", label: "Date", type: "date", value: e.date, required: true },
      { name: "note", label: "Note", value: e.note, full: true, maxlength: 120, placeholder: "e.g. Canteen lunch" },
    ],
    onSubmit: v => {
      if (!(v.amount > 0)) { toast("Enter an amount"); return false; }
      update(dd => {
        if (entry) Object.assign(dd.money.find(x => x.id === entry.id), v);
        else dd.money.push(Object.assign({ id: uid() }, v));
      });
      toast(entry ? "Entry updated" : (v.kind === "income" ? "Income added" : "Expense added"));
    },
    onDelete: entry ? () => { update(dd => { dd.money = dd.money.filter(x => x.id !== entry.id); }); toast("Entry deleted"); } : null,
  });
}

export function subjectTag(id) {
  const s = subjById(id);
  return s ? '<span class="pill" style="--c:' + esc(s.color) + '"><i class="dot"></i>' + esc(s.code || s.name) + "</span>" : "";
}
