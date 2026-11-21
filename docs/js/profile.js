// Profile menu (top right): who you are, quick settings, and shortcuts — like the account menu on any big site.
import { esc, openForm, toast, plural, today, download, pct } from "./ui.js";
import { store, update } from "./store.js";
import * as sync from "./sync.js";
import { applyTheme } from "./theme.js";
import { hapticsOn, setHaptics, hapticsSupported, haptic } from "./haptics.js";
import * as rem from "./reminders.js";
import { canInstall, installFlow, isStandalone } from "./install.js";
import { calendarExportForm } from "./ics.js";
import { aiOn } from "./ai.js";
import { overallStats } from "./calc.js";
import { streak } from "./insights.js";
import { taskForm, noteForm } from "./actions.js";

const pop = () => document.getElementById("profile-pop");
const btn = () => document.getElementById("profile-btn");

export function initials(d) {
  const n = (d.profile.name || (sync.S.user && sync.S.user.name) || "").trim();
  if (!n) return "";
  const parts = n.split(/\s+/);
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatar(d, big) {
  const u = sync.S.user, ini = initials(d);
  const inner = big && u && u.photo ? '<img src="' + esc(u.photo) + '" alt="" referrerpolicy="no-referrer">' :
    ini ? esc(ini) : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="9" r="3.6"/><path d="M4.5 20c.9-3.6 3.8-5.4 7.5-5.4s6.6 1.800 7.500 5.400"/></svg>';
  return '<span class="avatar' + (big ? " big" : "") + '">' + inner + "</span>";
}

function syncLine() {
  const u = sync.S.user, st = sync.S.status;
  if (!u) return sync.S.status === "unavailable" ? "Cloud sync unavailable" : "Not signed in · data stays on this device";
  const s = st === "synced" ? "Synced ✓" : st === "locked" ? "Sync locked" : st === "offline" ? "Offline" : st === "error" ? "Sync problem" : "Syncing…";
  return u.email + " · " + s;
}

function row(act, label, hint, extra) {
  return '<button class="pp-row" data-pp="' + act + '"><span>' + esc(label) + "</span>" + (hint ? '<span class="mono faint">' + esc(hint) + "</span>" : "") + (extra || "") + "</button>";
}
function tog(id, label, on) {
  return '<label class="pp-tog"><span>' + esc(label) + '</span><input type="checkbox" role="switch" id="' + id + '"' + (on ? " checked" : "") + "><i></i></label>";
}

function chips(d) {
  const o = overallStats(d), st = streak(d), t = today();
  const due = d.tasks.filter(x => !x.done && x.due && x.due <= t).length;
  const out = [];
  if (o.total) out.push('<a class="pp-chip ' + (o.ok ? "good" : "bad") + '" href="#/attendance"><b>' + pct(o.percent) + "%</b> attendance</a>");
  if (st.current >= 2) out.push('<a class="pp-chip" href="#/attendance"><b>◆ ' + st.current + "</b> day streak</a>");
  if (due) out.push('<a class="pp-chip warn" href="#/tasks"><b>' + due + "</b> due / overdue</a>");
  return out.length ? '<div class="pp-chips">' + out.join("") + "</div>" : "";
}

function ringAvatar(d) {
  const o = overallStats(d);
  const p = o.total ? Math.max(2, Math.min(100, o.percent)) : 0;
  return '<span class="pp-ring' + (o.total ? (o.ok ? " good" : " bad") : "") + '" style="--p:' + p + '">' + avatar(d, true) + "</span>";
}

function render(d) {
  const p = d.profile, theme = d.settings.theme;
  const sub = [p.college, p.course, p.semester && "Sem " + p.semester].filter(Boolean).join(" · ");
  const R = rem.prefs();
  pop().innerHTML =
    '<div class="pp-head">' + ringAvatar(d) +
      '<div class="pp-who"><div class="pp-name">' + esc(p.name || (sync.S.user && sync.S.user.name) || "Your profile") + "</div>" +
      '<div class="pp-sub">' + esc(sub || "Add your college and course") + "</div>" +
      '<div class="pp-sync mono">' + esc(syncLine()) + "</div></div></div>" +
    chips(d) +
    '<div class="pp-actions"><button class="btn xs" data-pp="edit">Edit profile</button>' +
      (sync.S.user ? '<button class="btn xs ghost" data-pp="syncnow">Sync now</button>' : sync.S.status !== "unavailable" ? '<button class="btn xs solid" data-pp="signin">Sign in with Google</button>' : "") + "</div>" +
    '<div class="pp-sec"><div class="pp-lab mono">Quick add</div><div class="pp-quick">' +
      '<button class="btn xs" data-pp="q:task">+ Task</button><button class="btn xs" data-pp="q:note">+ Note</button><button class="btn xs" data-pp="q:present">✓ Mark today</button></div></div>' +
    '<div class="pp-sec"><div class="pp-lab mono">Appearance</div><div class="seg" role="group" aria-label="Theme">' +
      [["dark", "Dark"], ["light", "Light"], ["system", "Auto"]].map(t => '<button data-theme-set="' + t[0] + '" class="' + (theme === t[0] ? "on" : "") + '">' + t[1] + "</button>").join("") + "</div>" +
      (hapticsSupported() ? tog("pp-hap", "Haptic taps", hapticsOn()) : "") +
      tog("pp-rem", "Reminders", R.on && rem.permission() === "granted") +
    "</div>" +
    '<div class="pp-sec">' +
      row("go:settings", "Profile & settings", "") +
      row("go:wrapped", "Semester Wrapped", "✦") +
      row("go:assistant", "Ask Campus AI", aiOn() ? "on" : "✦") +
      row("cal", "Add to calendar", ".ics") +
      (canInstall() ? row("install", "Install as an app", "") : "") +
    "</div>" +
    '<div class="pp-sec">' +
      row("invite", "Invite a classmate", "↗") +
      row("backup", "Download backup", ".json") +
      '<a class="pp-row" href="https://github.com/hrishikeshdas366-eng/campus-os/issues" target="_blank" rel="noopener"><span>Send feedback</span><span class="mono faint">↗</span></a>' +
    "</div>" +
    '<div class="pp-sec pp-foot">' +
      '<a class="pp-row" href="privacy.html"><span>Privacy</span></a>' +
      (sync.S.user ? '<button class="pp-row" data-pp="signout"><span>Sign out</span></button>' : "") +
    "</div>";
}

function paintButton() {
  const b = btn(); if (!b) return;
  b.innerHTML = avatar(store.data, false);
  b.setAttribute("aria-label", "Profile and quick settings");
}

export function setOpen(open) {
  const p = pop(); if (!p) return;
  if (open) render(store.data);
  document.body.classList.toggle("pp-open", open);
  btn().setAttribute("aria-expanded", String(open));
}
const isOpen = () => document.body.classList.contains("pp-open");

export function profileForm() {
  const p = store.data.profile;
  openForm({
    eyebrow: "Profile", title: "Edit your profile",
    fields: [
      { name: "name", label: "Name", value: p.name, maxlength: 60, full: true },
      { name: "college", label: "College", value: p.college, maxlength: 80, full: true },
      { name: "course", label: "Course", value: p.course, maxlength: 80 },
      { name: "semester", label: "Semester", value: p.semester, maxlength: 10 },
      { name: "target", label: "Attendance target (%)", type: "number", value: p.target, min: 1, max: 100, step: 0.5 },
      { name: "gradeScale", label: "Grading scale", type: "select", value: p.gradeScale, options: [{ value: "10", label: "10-point" }, { value: "4", label: "4-point" }] },
    ],
    submitLabel: "Save",
    onSubmit(v) {
      update(dd => {
        ["name", "college", "course", "semester"].forEach(k => { dd.profile[k] = v[k] || ""; });
        dd.profile.target = Math.min(100, Math.max(1, v.target || 75));
        dd.profile.gradeScale = v.gradeScale;
      });
      toast("Profile saved");
    },
  });
}

export function initProfile() {
  paintButton();
  const b = btn(), p = pop();
  b.addEventListener("click", e => { e.stopPropagation(); setOpen(!isOpen()); });
  document.addEventListener("click", e => { if (isOpen() && !p.contains(e.target) && !b.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) { setOpen(false); b.focus(); } });
  window.addEventListener("hashchange", () => setOpen(false));
  sync.onSyncChange(() => { paintButton(); if (isOpen()) render(store.data); });

  p.addEventListener("click", async e => {
    const t = e.target.closest("[data-theme-set]");
    if (t) {
      update(dd => { dd.settings.theme = t.dataset.themeSet; });
      applyTheme(t.dataset.themeSet);
      render(store.data);
      return;
    }
    const a = e.target.closest("[data-pp]");
    if (!a) return;
    const [act, arg] = a.dataset.pp.split(":");
    if (act === "go") { location.hash = "#/" + arg; setOpen(false); }
    else if (act === "edit") { setOpen(false); profileForm(); }
    else if (act === "cal") { setOpen(false); calendarExportForm(); }
    else if (act === "q") {
      setOpen(false);
      if (arg === "task") taskForm(null);
      else if (arg === "note") noteForm(null);
      else import("./views/attendance.js").then(m => m.markRemaining(today(), "present"));
    }
    else if (act === "invite") {
      const url = location.origin + location.pathname.replace(/index\.html$/, "");
      const text = "I use Campus OS to track attendance, timetable and deadlines — free and private.";
      try { if (navigator.share) { await navigator.share({ title: "Campus OS", text, url }); return; } } catch (err) { if (err && err.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); toast("Link copied — send it to a friend"); } catch (_) { toast(url); }
    }
    else if (act === "backup") { download("campus-os-backup-" + today() + ".json", JSON.stringify(store.data, null, 1)); toast("Backup downloaded"); }
    else if (act === "install") { setOpen(false); installFlow(); }
    else if (act === "signin") { setOpen(false); sync.signIn(); }
    else if (act === "syncnow") { sync.syncNow(); }
    else if (act === "signout") { setOpen(false); if (confirm("Sign out on this device? Your data stays here and in the cloud.")) sync.signOut(); }
  });
  p.addEventListener("change", async e => {
    if (e.target.id === "pp-hap") { setHaptics(e.target.checked); if (e.target.checked) haptic(true); }
    if (e.target.id === "pp-rem") {
      if (e.target.checked) {
        try { await rem.enable(); toast("Reminders on"); }
        catch (err) { e.target.checked = false; toast(err.message, { error: true }); }
      } else { rem.disable(); toast("Reminders off"); }
    }
  });
  // keep the header avatar current when the profile changes
  let last = "";
  const sig = () => (store.data.profile.name || "") + "|" + (sync.S.user ? sync.S.user.photo : "");
  last = sig();
  return () => { const s = sig(); if (s !== last) { last = s; paintButton(); } if (isOpen()) render(store.data); };
}
