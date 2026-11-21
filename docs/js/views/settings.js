import { haptic, hapticsOn, setHaptics, hapticsSupported } from "../haptics.js";
import { esc, toast, download, today, plural } from "../ui.js";
import { store, update, replaceAll, emptyData } from "../store.js";
import { demoData } from "../demo.js";
import { pageHead } from "./common.js";
import * as sync from "../sync.js";
import * as rem from "../reminders.js";
import { canInstall, installFlow, isStandalone } from "../install.js";
import { calendarExportForm } from "../ics.js";
import { aiOn, setAi, aiAvailable } from "../ai.js";

function deviceSection() {
  const R = rem.prefs(), on = R.on && rem.permission() === "granted";
  const blocked = rem.supported() && rem.permission() === "denied";
  return '<section class="section" id="dev"><div class="section-head"><h2 class="h-md">App &amp; reminders</h2><span class="mono">This device</span></div>' +
    '<div class="form-grid">' +
      '<div class="full row" style="gap:10px">' + (isStandalone() ? '<span class="pill good">Installed ✓</span>' : canInstall() ? '<button class="btn" data-d="install">Install as an app</button>' : '<span class="muted" style="font-size:13px">Open this site in Chrome, Edge or Safari to install it as an app.</span>') +
        '<button class="btn" data-d="cal">Add to calendar (.ics)</button></div>' +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="r-on"' + (on ? " checked" : "") + '><span>Reminders on this device</span></label>' +
      '<label class="field"><span>Class alert</span><select id="r-lead">' + [5, 10, 15, 30].map(m => '<option value="' + m + '"' + (R.lead === m ? " selected" : "") + ">" + m + " min before</option>").join("") + "</select></label>" +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="r-mark"' + (R.markAfter ? " checked" : "") + '><span>Nudge me to mark attendance after class</span></label>' +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="r-dig"' + (R.digest ? " checked" : "") + '><span>Morning summary (classes, deadlines, exams)</span></label>' +
    "</div>" +
    (blocked ? '<p class="bad" style="font-size:13px">Notifications are blocked for this site — allow them in your browser or phone settings.</p>' : "") +
    '<p class="muted" style="font-size:13px;max-width:64ch;margin-top:10px">Reminders work while Campus OS is open or running in the background (installed apps on a computer; on iPhone add it to your Home Screen first). For alerts that fire even when the app is closed, use <b>Add to calendar</b> — your phone’s own Calendar does the reminding.</p></section>' +
    (aiAvailable() ? '<section class="section" id="aisec"><div class="section-head"><h2 class="h-md">Campus AI ✦</h2><span class="mono">This device</span></div>' +
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="ai-on"' + (aiOn() ? " checked" : "") + '><span>Allow Campus AI (Google Gemini)</span></label>' +
      '<p class="muted" style="font-size:13px;max-width:64ch;margin-top:10px">Summarise notes, plan revision and ask about your week. Text goes to Google <b>only when you press a ✦ button</b> and is <b>not</b> end-to-end encrypted like your synced data. Needs Google sign-in. <a href="#/assistant">Open Ask AI →</a></p></section>' : "");
}

function syncSection() {
  const s = sync.S;
  const label = { working: "Syncing…", synced: "Up to date", locked: "Locked", offline: "Offline", error: "Problem" }[s.status] || "";
  let body;
  if (s.status === "unavailable") {
    body = '<p class="muted" style="margin:0">Cloud sync isn\'t switched on for this copy of the app.</p>';
  } else if (!s.user) {
    body = '<p class="muted" style="max-width:64ch;margin-top:0">Use Campus OS on every device. Sign in with Google and your data syncs automatically. It is <b>encrypted on your device with a passphrase only you know</b> before it is uploaded, so nobody else can read it — not even the app\'s developer.</p>' +
      '<div class="row"><button class="btn solid" data-a="sync-in"' + (s.status === "working" ? " disabled" : "") + '>Sign in with Google</button></div>' +
      (s.message ? '<p class="bad" style="margin-bottom:0">' + esc(s.message) + "</p>" : "");
  } else {
    body = '<div class="row" style="gap:14px;margin-bottom:14px">' + (s.user.photo ? '<img src="' + esc(s.user.photo) + '" alt="" referrerpolicy="no-referrer" style="width:40px;height:40px;border-radius:50%">' : "") +
      '<div class="grow"><div class="title" style="font-weight:600">' + esc(s.user.name || "Signed in") + '</div><div class="muted" style="font-size:13px">' + esc(s.user.email) + "</div></div>" +
      '<span class="pill ' + (s.status === "synced" ? "good" : s.status === "error" ? "bad" : s.status === "locked" || s.status === "offline" ? "warn" : "") + '">' + esc(label) + "</span></div>" +
      (s.message ? '<p class="' + (s.status === "error" ? "bad" : "muted") + '" style="margin-top:0">' + esc(s.message) + "</p>" : "") +
      (s.lastSync ? '<p class="mono muted" style="margin-top:0">Last synced ' + esc(new Date(s.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) + "</p>" : "") +
      (s.confirmedAt ? '<p class="mono muted" style="margin-top:0">Stays signed in on this device · we\'ll ask you to confirm on ' + esc(new Date(s.confirmedAt + 30 * 864e5).toLocaleDateString([], { day: "numeric", month: "short" })) + "</p>" : "") +
      '<div class="row">' + (s.status === "locked" ? '<button class="btn solid" data-a="sync-unlock">Enter passphrase</button>' : '<button class="btn" data-a="sync-now">Sync now</button>') +
      '<button class="btn ghost" data-a="sync-out">Sign out</button><button class="btn danger" data-a="sync-del" style="margin-left:auto">Delete my cloud data</button></div>';
  }
  return '<section class="section"><div class="section-head"><h2 class="h-md">Cloud sync</h2><span class="mono">Optional · end-to-end encrypted</span></div>' + body +
    '<p class="mono muted" style="margin-top:18px"><a href="privacy.html">Privacy &amp; how sync works</a></p></section>';
}

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
      '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="intro"' + (s.intro ? " checked" : "") + '><span>Show the intro animation when the app opens</span></label>' +
      (hapticsSupported() ? '<label class="field full" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="hap"' + (hapticsOn() ? " checked" : "") + '><span>Haptic taps on this device <span class="muted">(applies instantly, this device only)</span></span></label>' : "") + "</div>" +
      '<div class="row" style="margin-top:16px"><button class="btn solid" type="submit">Save preferences</button></div></form>' +

    deviceSection() +
    syncSection() +

    '<section class="section"><div class="section-head"><h2 class="h-md">Your data</h2><span class="mono">' + (store.mode === "disk" ? "Saved on this Mac" : "Saved in this browser") + "</span></div>" +
      '<p class="muted" style="max-width:64ch;margin-top:0">' + (store.mode === "disk"
        ? "Everything is stored in <code>" + esc(store.diskPath) + "</code> on this computer, with a daily backup alongside it. Nothing leaves this computer unless you turn on cloud sync (which uploads only encrypted data)."
        : "Everything is stored in this browser on this device. Nothing leaves it unless you turn on cloud sync (which uploads only encrypted data). Clearing site data erases the local copy, so download a backup now and then.") + "</p>" +
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
  root.addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; if (b.dataset.d === "install") installFlow(); else if (b.dataset.d === "cal") calendarExportForm(); });
  const r = id => root.querySelector(id);
  if (r("#r-on")) {
    r("#r-on").addEventListener("change", async e => {
      if (e.target.checked) { try { await rem.enable(); toast("Reminders on"); } catch (err) { e.target.checked = false; toast(err.message, { error: true }); } }
      else { rem.disable(); toast("Reminders off"); }
    });
    r("#r-lead").addEventListener("change", e => rem.setPrefs({ lead: Number(e.target.value) }));
    r("#r-mark").addEventListener("change", e => rem.setPrefs({ markAfter: e.target.checked }));
    r("#r-dig").addEventListener("change", e => rem.setPrefs({ digest: e.target.checked }));
  }
  if (r("#ai-on")) r("#ai-on").addEventListener("change", async e => {
    if (!e.target.checked) { setAi(false); toast("Campus AI turned off"); return; }
    const ai = await import("../ai.js");
    if (await ai.consent()) { setAi(true); toast("Campus AI allowed"); } else e.target.checked = false;
  });
  const hap = root.querySelector("#hap");
  if (hap) hap.addEventListener("change", () => { setHaptics(hap.checked); if (hap.checked) haptic(true); toast(hap.checked ? "Haptics on" : "Haptics off"); });
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
    if (a === "sync-in") sync.signIn();
    else if (a === "sync-now") sync.syncNow();
    else if (a === "sync-unlock") sync.unlock();
    else if (a === "sync-out") sync.signOut();
    else if (a === "sync-del") sync.deleteAccount();
    else if (a === "export") download("campus-os-backup-" + today() + ".json", JSON.stringify(store.data, null, 1));
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
      const fresh = emptyData(); fresh.settings.onboarded = true;
      replaceAll(fresh);
      toast("Everything erased");
    }
  });
}
