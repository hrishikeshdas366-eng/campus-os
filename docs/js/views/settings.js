import { esc, toast, download, today, plural } from "../ui.js";
import { store, update, replaceAll, emptyData } from "../store.js";
import { demoData } from "../demo.js";
import { pageHead } from "./common.js";

function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

export function render(root, d) {
  const p = d.profile, s = d.settings;
  const sel = (name, val, opts) => '<select name="' + name + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>";

  root.innerHTML = '<div class="page">' +
    pageHead("10", "Settings", "", "Profile & data") +
    '<form id="prof" class="fade-up" style="--d:.2s"><div class="section-head"><h2 class="h-md">Profile</h2></div><div class="form-grid">' +
      '<label class="field"><span>Name</span><input name="name" value="' + esc(p.name) + '" maxlength="60"></label>' +
      '<label class="field"><span>College</span><input name="college" value="' + esc(p.college) + '" maxlength="80"></label>' +
      '<label class="field"><span>Course</span><input name="course" value="' + esc(p.course) + '" maxlength="80"></label>' +
      '<label class="field"><span>Semester</span><input name="semester" value="' + esc(p.semester) + '" maxlength="10"></label>' +
      '<label class="field"><span>Default attendance target (%)</span><input name="target" type="number" min="1" max="100" step="0.5" value="' + esc(p.target) + '"></label>' +
      '<label class="field"><span>Grading scale</span>' + sel("gradeScale", p.gradeScale, [["10", "10-point"], ["4", "4-point"]]) + "</label></div>" +
      '<div class="row" style="margin-top:16px"><button class="btn solid" type="submit">Save profile</button></div></form>' +

    '<form id="pref" class="section"><div class="section-head"><h2 class="h-md">Preferences</h2></div><div class="form-grid">' +
      '<label class="field"><span>Theme</span>' + sel("theme", s.theme, [["dark", "Dark"], ["light", "Light"], ["system", "Match system"]]) + "</label>" +
      '<label class="field"><span>Currency symbol</span><input name="currency" value="' + esc(s.currency) + '" maxlength="4"></label>' +
      '<label class="field"><span>Focus session (minutes)</span><input name="focusMinutes" type="number" min="1" max="180" value="' + esc(s.focusMinutes) + '"></label>' +
      '<label class="field"><span>Break (minutes)</span><input name="breakMinutes" type="number" min="1" max="60" value="' + esc(s.breakMinutes) + '"></label>' +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="intro"' + (s.intro ? " checked" : "") + '><span>Show the intro animation when the app opens</span></label></div>' +
      '<div class="row" style="margin-top:16px"><button class="btn solid" type="submit">Save preferences</button></div></form>' +

    '<section class="section"><div class="section-head"><h2 class="h-md">Your data</h2><span class="mono">' + (store.mode === "disk" ? "Saved on this Mac" : "Saved in this browser") + "</span></div>" +
      '<p class="muted" style="max-width:64ch;margin-top:0">' + (store.mode === "disk"
        ? "Everything is stored in <code>" + esc(store.diskPath) + "</code> on this computer — nothing is sent anywhere, and a daily backup is kept alongside it."
        : "Everything is stored in this browser on this device — nothing is sent to any server. Clearing site data erases it, so download a backup now and then.") + "</p>" +
      '<div class="row"><button class="btn" data-a="export">Download backup (JSON)</button><button class="btn" data-a="csv">Export attendance (CSV)</button><label class="btn" style="cursor:pointer">Restore backup<input type="file" id="imp" accept="application/json,.json" class="hidden"></label></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn ghost" data-a="demo">Load sample data</button><button class="btn danger" data-a="reset">Erase everything</button></div></section>' +

    '<section class="section"><div class="section-head"><h2 class="h-md">At a glance</h2></div><div class="muted">' +
      [plural(d.subjects.length, "subject"), plural(d.attendance.length, "attendance record"), plural(d.tasks.length, "task"), plural(d.exams.length, "exam"), plural(d.notes.length, "note")].join(" · ") + "</div></section></div>";

  root.querySelector("#prof").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    update(dd => {
      ["name", "college", "course", "semester"].forEach(k => { dd.profile[k] = String(f.get(k) || "").trim(); });
      dd.profile.target = Math.min(100, Math.max(1, Number(f.get("target")) || 75));
      dd.profile.gradeScale = f.get("gradeScale");
    });
    toast("Profile saved");
  });
  root.querySelector("#pref").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    update(dd => {
      dd.settings.theme = f.get("theme");
      dd.settings.currency = String(f.get("currency") || "₹").trim() || "₹";
      dd.settings.focusMinutes = Math.min(180, Math.max(1, Number(f.get("focusMinutes")) || 25));
      dd.settings.breakMinutes = Math.min(60, Math.max(1, Number(f.get("breakMinutes")) || 5));
      dd.settings.intro = f.get("intro") === "on";
    });
    toast("Preferences saved");
  });
  root.querySelector("#imp").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      if (!doc || doc.app !== "campus-os") throw new Error("not a Campus OS backup");
      if (!confirm("Replace everything in the app with this backup?")) return;
      replaceAll(doc);
      toast("Backup restored");
    } catch (err) { toast("Couldn't restore: " + err.message, { error: true }); }
    e.target.value = "";
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "export") download("campus-os-backup-" + today() + ".json", JSON.stringify(store.data, null, 1));
    else if (a === "csv") {
      const subj = id => d.subjects.find(x => x.id === id);
      const rows = [["date", "subject", "code", "status", "note"]].concat(d.attendance.slice().sort((x, y) => x.date.localeCompare(y.date))
        .map(r => [r.date, (subj(r.subjectId) || {}).name || "", (subj(r.subjectId) || {}).code || "", r.status, r.note || ""]));
      download("attendance-" + today() + ".csv", rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv");
    } else if (a === "demo") {
      if ((d.subjects.length || d.attendance.length) && !confirm("This replaces your current data with sample data. Continue?")) return;
      replaceAll(demoData());
      toast("Sample data loaded");
    } else if (a === "reset") {
      if (!confirm("Erase ALL data in Campus OS? This can't be undone.")) return;
      if (prompt('Type ERASE to confirm') !== "ERASE") return;
      replaceAll(emptyData());
      toast("Everything erased");
    }
  });
}
