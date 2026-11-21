// Calendar export (.ics): classes (weekly), exams and task deadlines, each with built-in alarms.
// This is the one reminder channel that works even when Campus OS is closed — the phone's own Calendar fires the alerts.
import { today, addDays, weekday, download, toast, openForm, toMin, esc } from "./ui.js";
import { store } from "./store.js";

const z = n => String(n).padStart(2, "0");
const stamp = () => { const d = new Date(); return d.getUTCFullYear() + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) + "T" + z(d.getUTCHours()) + z(d.getUTCMinutes()) + z(d.getUTCSeconds()) + "Z"; };
const dstr = s => s.replace(/-/g, "");
const tstr = m => z(Math.floor(m / 60) % 24) + z(m % 60) + "00";
const text = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const out = []; let l = line;
  while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); }
  out.push(l);
  return out.join("\r\n");
}
const alarm = (trigger, label) => ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + text(label), "TRIGGER:" + trigger, "END:VALARM"];

export function buildICS(d, o) {
  o = Object.assign({ weeks: 18, lead: 10, classes: true, exams: true, tasks: true }, o || {});
  const t = today(), ts = stamp();
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campus OS//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Campus OS"];
  const subj = id => d.subjects.find(s => s.id === id);
  let n = 0;
  if (o.classes) {
    d.timetable.forEach(c => {
      const s = subj(c.subjectId);
      if (!s || s.archived || toMin(c.start) == null) return;
      let first = t; for (let i = 0; i < 7 && weekday(first) !== c.day; i++) first = addDays(first, 1);
      const sm = toMin(c.start), em = toMin(c.end) != null ? toMin(c.end) : sm + 60;
      L.push("BEGIN:VEVENT", "UID:cls-" + c.id + "@campus-os", "DTSTAMP:" + ts,
        "DTSTART:" + dstr(first) + "T" + tstr(sm), "DTEND:" + dstr(first) + "T" + tstr(em),
        "RRULE:FREQ=WEEKLY;COUNT=" + o.weeks,
        fold("SUMMARY:" + text(s.name + (c.kind && c.kind !== "Lecture" ? " (" + c.kind + ")" : ""))));
      if (c.room) L.push(fold("LOCATION:" + text(c.room)));
      L.push(...alarm("-PT" + o.lead + "M", s.name + " starts in " + o.lead + " min" + (c.room ? " · " + c.room : "")), "END:VEVENT");
      n++;
    });
  }
  if (o.exams) {
    d.exams.filter(e => e.date >= t).forEach(e => {
      const s = subj(e.subjectId), title = (s ? s.name : "Exam") + (e.title ? " — " + e.title : "") + " exam";
      L.push("BEGIN:VEVENT", "UID:exam-" + e.id + "@campus-os", "DTSTAMP:" + ts);
      if (e.time) {
        const sm = toMin(e.time);
        L.push("DTSTART:" + dstr(e.date) + "T" + tstr(sm), "DTEND:" + dstr(e.date) + "T" + tstr(sm + 120));
      } else L.push("DTSTART;VALUE=DATE:" + dstr(e.date), "DTEND;VALUE=DATE:" + dstr(addDays(e.date, 1)));
      L.push(fold("SUMMARY:" + text(title)));
      if (e.room) L.push(fold("LOCATION:" + text(e.room)));
      if (e.syllabus) L.push(fold("DESCRIPTION:" + text(e.syllabus)));
      L.push(...alarm(e.time ? "-P1D" : "-PT15H", title + " tomorrow"), ...alarm(e.time ? "-PT2H" : "-PT0S", title + " today"), "END:VEVENT");
      n++;
    });
  }
  if (o.tasks) {
    d.tasks.filter(x => !x.done && x.due && x.due >= t).forEach(x => {
      L.push("BEGIN:VEVENT", "UID:task-" + x.id + "@campus-os", "DTSTAMP:" + ts,
        "DTSTART;VALUE=DATE:" + dstr(x.due), "DTEND;VALUE=DATE:" + dstr(addDays(x.due, 1)),
        fold("SUMMARY:" + text("Due: " + x.title)), "TRANSP:TRANSPARENT",
        ...alarm("-PT15H", "Due tomorrow: " + x.title), ...alarm("PT8H", "Due today: " + x.title), "END:VEVENT");
      n++;
    });
  }
  L.push("END:VCALENDAR");
  return { ics: L.join("\r\n") + "\r\n", count: n };
}

export function calendarExportForm() {
  openForm({
    eyebrow: "Calendar", title: "Add to your calendar",
    fields: [
      { type: "html", full: true, html: '<p class="muted" style="margin:0">Creates a calendar file with your classes (repeating weekly), exams and task deadlines — each with an alert. Open it on your phone or Mac and your own Calendar app will remind you, <b>even when Campus OS is closed</b>.</p>' },
      { name: "weeks", label: "Repeat classes for", type: "select", options: [4, 8, 12, 16, 18, 20, 24].map(w => ({ value: w, label: w + " weeks" })), value: 18 },
      { name: "lead", label: "Class alert", type: "select", options: [5, 10, 15, 30].map(m => ({ value: m, label: m + " min before" })), value: 10 },
      { name: "classes", label: "Classes", type: "checkbox", value: true },
      { name: "exams", label: "Exams", type: "checkbox", value: true },
      { name: "tasks", label: "Task deadlines", type: "checkbox", value: true },
    ],
    submitLabel: "Download .ics",
    onSubmit(v) {
      const { ics, count } = buildICS(store.data, { weeks: Number(v.weeks), lead: Number(v.lead), classes: v.classes, exams: v.exams, tasks: v.tasks });
      if (!count) { toast("Nothing to export yet — add classes, exams or tasks first", { error: true }); return false; }
      download("campus-os.ics", ics, "text/calendar");
      toast("Calendar file ready — open it to add " + count + " event" + (count === 1 ? "" : "s"));
    },
  });
}
