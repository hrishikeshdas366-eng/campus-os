// First-run onboarding: a short, skippable guided setup shown only on an empty install.
import { store, update, uid, replaceAll, subscribe } from "./store.js";
import { esc, maskLines, PALETTE, toast } from "./ui.js";
import { demoData } from "./demo.js";
import * as sync from "./sync.js";

let el = null, step = 0, unsub = null;
const draft = { name: "", college: "", course: "", semester: "", target: 75, subjects: "" };
const STEPS = 4;

const isFresh = d => !d.settings.onboarded && !d.subjects.length && !d.profile.name && !d.attendance.length;

export function maybeOnboard() {
  if (el || !isFresh(store.data)) return;
  el = document.createElement("div");
  el.id = "onboard";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Welcome to Campus OS");
  document.body.appendChild(el);
  document.body.classList.add("ob-open");
  // if data arrives (e.g. restored from the cloud) while this is open, close it quietly
  unsub = subscribe(ev => { if (ev.type === "change" && el && !isFresh(store.data)) done(false); });
  draw();
}

function parseSubjects(text) {
  return text.split(/\n|;/).map(l => l.trim()).filter(Boolean).slice(0, 20).map((l, i) => {
    const [name, code] = l.split(",").map(x => x.trim());
    return { name, code: code || "" };
  }).filter(s => s.name);
}

function done(go) {
  if (!el) return;
  if (unsub) { unsub(); unsub = null; }
  const node = el; el = null;
  document.body.classList.remove("ob-open");
  node.classList.add("out");
  setTimeout(() => node.remove(), 450);
  if (go) location.hash = go;
}

function finish(go) {
  const subs = parseSubjects(draft.subjects);
  if (unsub) { unsub(); unsub = null; }   // we close ourselves below (keeps the navigation target)
  update(d => {
    d.settings.onboarded = true;
    d.profile.name = draft.name.trim();
    d.profile.college = draft.college.trim();
    d.profile.course = draft.course.trim();
    d.profile.semester = draft.semester.trim();
    d.profile.target = Math.min(100, Math.max(1, Number(draft.target) || 75));
    subs.forEach((s, i) => d.subjects.push({ id: uid(), name: s.name, code: s.code, faculty: "", color: PALETTE[(d.subjects.length) % PALETTE.length], target: null, credits: "", archived: false }));
  });
  toast(subs.length ? "All set — " + subs.length + (subs.length === 1 ? " subject" : " subjects") + " added" : "All set");
  done(go);
}

function skip() {
  if (unsub) { unsub(); unsub = null; }
  update(d => { d.settings.onboarded = true; });
  done("");
}

function collect() {
  if (!el) return;
  el.querySelectorAll("[data-f]").forEach(i => { draft[i.dataset.f] = i.value; });
}

function field(key, label, ph, type, extra) {
  return '<label class="field"><span>' + label + '</span><input data-f="' + key + '" type="' + (type || "text") + '" value="' + esc(draft[key]) + '" placeholder="' + esc(ph || "") + '" ' + (extra || "") + "></label>";
}

function draw() {
  if (!el) return;
  const dots = '<div class="ob-dots" aria-hidden="true">' + Array.from({ length: STEPS }, (_, i) => '<i class="' + (i <= step ? "on" : "") + '"></i>').join("") + "</div>";
  const canSync = sync.S.status !== "unavailable";
  let body = "";
  if (step === 0) {
    body = '<h1 class="display">' + maskLines(["Your semester,", "sorted."]) + "</h1>" +
      '<p class="lead">Attendance, timetable, deadlines, exams, grades, notes, budget and focus — all in one place. Let’s set it up in under a minute.</p>' +
      '<div class="ob-actions"><button class="btn solid" data-go="next">Get started</button>' +
      (canSync ? '<button class="btn" data-go="restore">I already have an account</button>' : "") + "</div>" +
      '<div class="ob-actions" style="margin-top:14px"><button class="btn sm ghost" data-go="demo">Explore with sample data</button><button class="btn sm ghost" data-go="skip">Skip setup</button></div>';
  } else if (step === 1) {
    body = '<p class="mono muted">01 / 03 — About you</p><h1 class="display">' + maskLines(["Who’s", "studying?"]) + "</h1>" +
      '<div class="form-grid" style="margin-top:6px">' + field("name", "Your name", "e.g. Alex", "text", 'maxlength="60" autocomplete="given-name"') +
      field("college", "College", "e.g. State University", "text", 'maxlength="80"') +
      field("course", "Course", "e.g. B.Tech Computer Science", "text", 'maxlength="80"') +
      field("semester", "Semester", "e.g. 4", "text", 'maxlength="10"') +
      '<div class="full">' + field("target", "Attendance target (%) — most colleges ask for 75", "75", "number", 'min="1" max="100" step="0.5" inputmode="decimal"') + "</div></div>" +
      nav();
  } else if (step === 2) {
    const n = parseSubjects(draft.subjects).length;
    body = '<p class="mono muted">02 / 03 — Subjects</p><h1 class="display">' + maskLines(["What are you", "taking?"]) + "</h1>" +
      '<label class="field"><span>One subject per line — add a course code after a comma if you like</span><textarea data-f="subjects" rows="6" placeholder="Data Structures, CS201&#10;Database Systems, CS203&#10;Maths">' + esc(draft.subjects) + "</textarea></label>" +
      '<p class="mono muted" id="ob-count" style="margin:10px 0 0">' + (n ? n + (n === 1 ? " subject" : " subjects") + " ready" : "You can add these later too") + "</p>" + nav();
  } else {
    const n = parseSubjects(draft.subjects).length;
    body = '<p class="mono muted">03 / 03 — Ready</p><h1 class="display">' + maskLines(["You’re", "all set" + (draft.name ? ", " + esc(draft.name.split(" ")[0]) : "") + "."]) + "</h1>" +
      '<p class="lead">' + (n ? "Next, add your weekly classes so each day’s lectures show up ready to tick off." : "Add your subjects and weekly classes whenever you’re ready.") + "</p>" +
      '<div class="ob-actions"><button class="btn solid" data-go="finish-tt">' + (n ? "Build my timetable" : "Open the app") + '</button><button class="btn" data-go="finish-import">Import it from a photo</button><button class="btn ghost" data-go="finish-home">Take me home</button></div>' +
      '<p class="mono muted" style="margin-top:22px">Tip: install it from your browser’s Share menu to get an app icon.</p>';
  }
  el.innerHTML = '<div class="ob-top"><span class="mono">CAMPUS OS</span>' + (step ? dots : "") + (step ? '<button class="btn sm ghost" data-go="skip">Skip</button>' : "<span></span>") + '</div><div class="ob-main">' + body + "</div>";
  requestAnimationFrame(() => requestAnimationFrame(() => el && el.classList.add("in")));
  const first = el.querySelector("[data-f]");
  if (first && !("ontouchstart" in window)) first.focus();
  const ta = el.querySelector("textarea[data-f]");
  if (ta) ta.addEventListener("input", () => { const n = parseSubjects(ta.value).length; const c = el.querySelector("#ob-count"); if (c) c.textContent = n ? n + (n === 1 ? " subject" : " subjects") + " ready" : "You can add these later too"; });
}

function nav() {
  return '<div class="ob-actions"><button class="btn" data-go="back">Back</button><button class="btn solid" data-go="next">Continue</button></div>';
}

document.addEventListener("click", e => {
  const b = el && e.target.closest && e.target.closest("#onboard [data-go]");
  if (!b) return;
  const g = b.dataset.go;
  collect();
  if (g === "next") { step = Math.min(STEPS - 1, step + 1); el.classList.remove("in"); draw(); }
  else if (g === "back") { step = Math.max(0, step - 1); el.classList.remove("in"); draw(); }
  else if (g === "skip") skip();
  else if (g === "demo") { replaceAll(demoData()); toast("Sample data loaded — explore around"); done(""); }
  else if (g === "restore") { sync.signIn(); }
  else if (g === "finish-tt") finish(parseSubjects(draft.subjects).length ? "#/timetable" : "");
  else if (g === "finish-home") finish("");
  else if (g === "finish-import") { finish("#/timetable"); setTimeout(() => import("./import.js").then(m => m.openImport()), 700); }
});
document.addEventListener("keydown", e => {
  if (el && e.key === "Enter" && e.target.matches && e.target.matches("#onboard input")) { e.preventDefault(); const n = el.querySelector('[data-go="next"]'); if (n) n.click(); }
});
