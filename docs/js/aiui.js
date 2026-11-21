// AI buttons used inside other pages: summarise a note, build an exam revision plan.
import { esc, toast, today, fmtDate, addDays, daysBetween } from "./ui.js";
import { update, uid } from "./store.js";
import { subjById } from "./actions.js";

const dlg = () => document.getElementById("dlg");

/** Plain AI text → safe HTML (bullets, bold, line breaks). */
export function fmt(t) {
  const lines = String(t).replace(/\r/g, "").split("\n");
  let html = "", list = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1<em>$2</em>");
  for (const raw of lines) {
    const l = raw.trim();
    const m = l.match(/^([-*•]|\d+[.)]|\?)\s+(.*)$/);
    if (m) { if (!list) { html += '<ul class="ai-ul">'; list = true; } html += "<li>" + (m[1] === "?" ? '<span class="mono">Q</span> ' : "") + inline(m[2]) + "</li>"; }
    else { if (list) { html += "</ul>"; list = false; } if (l) html += "<p>" + inline(l.replace(/^#+\s*/, "")) + "</p>"; }
  }
  return html + (list ? "</ul>" : "");
}

export async function summariseNote(getTitle, getBody, onAdd) {
  const body = (getBody() || "").trim();
  if (body.length < 40) { toast("Write a bit more first — there's not enough to summarise"); return; }
  const ai = await import("./ai.js");
  if (!(await ai.ensureReady())) return;
  const out = document.getElementById("ai-out"), b = document.getElementById("ai-sum");
  b.disabled = true; out.innerHTML = '<p class="ai-busy mono"><i></i>Reading your note…</p>';
  try {
    const t = await ai.summarise(getTitle() || "Untitled", body);
    out.innerHTML = '<div class="ai-box">' + fmt(t) + '</div><div class="row" style="margin-top:10px"><button type="button" class="btn xs" id="ai-add">Add to note</button><span class="mono faint" style="font-size:10px">AI can be wrong — check it.</span></div>';
    document.getElementById("ai-add").onclick = () => { onAdd("\n\n— AI summary —\n" + t.trim()); toast("Added to your note"); };
  } catch (e) { out.innerHTML = '<p class="bad" style="font-size:13px">' + esc(e.message) + "</p>"; }
  b.disabled = false;
}

export async function planRevision(exam) {
  const ai = await import("./ai.js");
  if (!(await ai.ensureReady())) return;
  const s = subjById(exam.subjectId), name = (s ? s.name : "") || exam.title || "Exam";
  const days = daysBetween(today(), exam.date);
  if (days < 1) { toast("That exam is today — too late for a plan!"); return; }
  const d = dlg();
  d.innerHTML = '<form method="dialog"><div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">✦ Revision plan</p><h2 class="h-md">' + esc(name) + '</h2></div><button type="button" class="btn sm icon ghost" data-close aria-label="Close">✕</button></div>' +
    '<p class="muted" style="margin:0 0 14px;font-size:14px">' + days + " day" + (days === 1 ? "" : "s") + " until the exam (" + esc(fmtDate(exam.date)) + "). The AI sees only the subject name, the syllabus below and the dates.</p>" +
    '<div class="form-grid"><label class="field"><span>Study time per day</span><select id="pl-h">' + [1, 2, 3, 4, 5, 6].map(h => '<option value="' + h + '"' + (h === 2 ? " selected" : "") + ">" + h + " hour" + (h > 1 ? "s" : "") + "</option>").join("") + "</select></label>" +
    '<label class="field full"><span>Syllabus / topics</span><textarea id="pl-s" rows="6" placeholder="Paste your syllabus or list the units. Leave blank and the AI will assume the usual core topics.">' + esc(exam.syllabus || "") + "</textarea></label></div>" +
    '<div id="pl-out"></div><div class="dlg-foot"><button type="button" class="btn sm ghost" data-close>Cancel</button><button type="button" class="btn sm solid" id="pl-go">✦ Make my plan</button></div></form>';
  d.querySelectorAll("[data-close]").forEach(x => (x.onclick = () => d.close()));
  d.showModal();
  d.querySelector("#pl-go").onclick = async function () {
    const go = this, out = d.querySelector("#pl-out");
    go.disabled = true; out.innerHTML = '<p class="ai-busy mono"><i></i>Planning your days…</p>';
    try {
      const plan = await ai.revisionPlan({ subject: name, syllabus: d.querySelector("#pl-s").value, examDate: exam.date, hoursPerDay: Number(d.querySelector("#pl-h").value) });
      if (!plan.length) throw new Error("The AI didn't return a usable plan. Try again.");
      out.innerHTML = '<div class="mono muted" style="margin:14px 0 6px">Your plan — untick anything you don’t want</div><div class="list ai-plan">' + plan.map((p, k) =>
        '<label class="item" style="gap:12px;align-items:flex-start"><input type="checkbox" checked data-k="' + k + '" style="margin-top:4px"><span class="mono muted" style="width:78px;flex:none;margin-top:2px">' + esc(fmtDate(p.date, { weekday: false })) + '</span><span class="grow"><span class="title">' + esc(p.title) + '</span><span class="sub" style="display:block">' + esc(p.detail) + "</span></span></label>").join("") + "</div>";
      go.disabled = false; go.textContent = "Add to my tasks"; 
      go.onclick = () => {
        const picks = [...d.querySelectorAll("[data-k]")].filter(c => c.checked).map(c => plan[Number(c.dataset.k)]);
        if (!picks.length) return;
        update(dd => picks.forEach(p => dd.tasks.push({ id: uid(), title: (s ? s.name + ": " : "") + p.title, subjectId: exam.subjectId || "", kind: "Revision", due: p.date, priority: "Medium", notes: p.detail, done: false, created: today() })));
        d.close(); toast(picks.length + " revision task" + (picks.length === 1 ? "" : "s") + " added", { action: { label: "View", run: () => { location.hash = "#/tasks"; } } });
      };
    } catch (e) { out.innerHTML = '<p class="bad" style="font-size:13px;margin-top:12px">' + esc(e.message) + "</p>"; go.disabled = false; }
  };
}
