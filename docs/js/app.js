// Campus OS — app shell: boot, router, menu, intro.
import { loadStore, store, subscribe } from "./store.js";
import { $, $$, esc, maskLines, toast, today, fmtDate } from "./ui.js";
import { applyTheme } from "./theme.js";
import { taskForm, noteForm } from "./actions.js";
import { reveal } from "./views/common.js";
import * as home from "./views/home.js";
import * as attendance from "./views/attendance.js";
import * as timetable from "./views/timetable.js";
import * as tasks from "./views/tasks.js";
import * as exams from "./views/exams.js";
import * as grades from "./views/grades.js";
import * as notes from "./views/notes.js";
import * as budget from "./views/budget.js";
import * as focus from "./views/focus.js";
import * as settings from "./views/settings.js";
import * as wrapped from "./views/wrapped.js";
import * as assistant from "./views/assistant.js";
import * as sync from "./sync.js";
import { initHaptics } from "./haptics.js";
import { risks } from "./insights.js";
import { maybeOnboard } from "./onboarding.js";
import { initProfile } from "./profile.js";
import { startReminders } from "./reminders.js";

const ROUTES = [
  { path: "", name: "Home", mod: home, hint: "Overview" },
  { path: "attendance", name: "Attendance", mod: attendance, hint: "Mark & track" },
  { path: "timetable", name: "Timetable", mod: timetable, hint: "Your week" },
  { path: "tasks", name: "Tasks", mod: tasks, hint: "To-dos" },
  { path: "exams", name: "Exams", mod: exams, hint: "Countdowns" },
  { path: "grades", name: "Grades", mod: grades, hint: "GPA" },
  { path: "notes", name: "Notes", mod: notes, hint: "Notes & links" },
  { path: "budget", name: "Budget", mod: budget, hint: "Money" },
  { path: "focus", name: "Focus", mod: focus, hint: "Timer" },
  { path: "assistant", name: "Ask AI", mod: assistant, hint: "Gemini ✦" },
  { path: "settings", name: "Settings", mod: settings, hint: "You & data" },
  { path: "wrapped", name: "Wrapped", mod: wrapped, hint: "Your semester", hidden: true },
];
const QUOTES = [
  "Everything your semester needs, in one place.",
  "Small habits, big semester.",
  "Show up. Mark it. Move on.",
  "Future you will thank present you.",
  "One class at a time.",
];
const FOOTER = '<footer class="site-foot"><span class="mono">Campus OS</span><span class="mono">Private by design · optional encrypted sync · <a href="privacy.html">Privacy</a></span></footer>';

let current = null;
let cleanup = null;

const ctx = { refresh: () => show({ keep: true }) };

function parseRoute() {
  const seg = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return ROUTES.find(r => r.path === seg) || ROUTES[0];
}

function show(opts) {
  opts = opts || {};
  const r = parseRoute();
  const keep = !!opts.keep && r === current;
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
  // a fresh <main> each time drops the previous view's event listeners
  const old = $("#app");
  const root = old.cloneNode(false);
  old.replaceWith(root);
  root.className = keep ? "in" : "page-enter";
  const y = window.scrollY;
  try {
    cleanup = r.mod.render(root, store.data, ctx) || null;
  } catch (e) {
    console.error(e);
    root.innerHTML = '<div class="page"><div class="empty"><p class="h-sm">Something went wrong on this page</p><p>' + esc(e.message) + "</p></div></div>";
  }
  root.insertAdjacentHTML("beforeend", FOOTER);
  if (keep) {
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
    document.title = (r.path ? r.name + " · " : "") + "Campus OS";
    if (!opts.defer) reveal(root);
  }
  current = r;
  $$(".menu-link").forEach(a => a.classList.toggle("active", a.dataset.path === r.path));
  try {
    const bad = risks(store.data).filter(x => x.level === "bad").length;
    const h = $('.menu-link[data-path="attendance"] .hint');
    if (h) { h.textContent = bad ? bad + " at risk" : "Mark & track"; h.classList.toggle("alert", !!bad); }
  } catch (_) { /* ignore */ }
}

const settings_route = () => ROUTES.find(r => r.path === "settings");

// ---------- menu ----------
function buildMenu() {
  $("#menu-nav").innerHTML = ROUTES.filter(r => !r.hidden).map((r, i) =>
    '<a class="menu-link" href="#/' + r.path + '" data-path="' + r.path + '"><span class="mono">' + String(i + 1).padStart(2, "0") +
    '</span><span class="display">' + maskLines([esc(r.name)]) + '</span><span class="mono hint">' + esc(r.hint) + "</span></a>").join("");
  $("#menu-date").textContent = fmtDate(today(), { year: true });
  $("#menu-quote").textContent = QUOTES[new Date().getDate() % QUOTES.length];
  menuStorage();
}
function menuStorage() {
  const base = store.mode === "disk" ? "Saved on this Mac" : "Saved in this browser · back up in Settings";
  const st = sync.S.status;
  $("#menu-storage").textContent = base + (sync.S.user ? (st === "synced" ? " · Synced ✓" : st === "locked" ? " · Sync locked" : st === "offline" ? " · Offline" : st === "error" ? " · Sync problem" : " · Syncing…") : "");
}
function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  $("#menu-btn").setAttribute("aria-expanded", String(open));
  $("#menu-label").textContent = open ? "Close" : "Menu";
}
function bindMenu() {
  $("#menu-btn").addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  $("#menu").addEventListener("click", e => {
    if (e.target.closest(".menu-link")) { setMenu(false); return; }
    const q = e.target.closest("[data-quick]");
    if (!q) return;
    setMenu(false);
    if (q.dataset.quick === "present") import("./views/attendance.js").then(m => m.markRemaining(today(), "present"));
    else if (q.dataset.quick === "task") taskForm(null);
    else if (q.dataset.quick === "note") noteForm(null);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) setMenu(false); });
}

// ---------- header bits ----------
function clock() {
  const n = new Date();
  $("#head-clock").textContent = fmtDate(today(), { year: false }) + " · " + String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
}

// ---------- intro ----------
function intro() {
  const pre = $("#preloader");
  let seen = false;
  try { seen = sessionStorage.getItem("campusos:intro") === "1"; } catch (_) { /* ignore */ }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!store.data.settings.intro || seen || reduce) { pre.remove(); return false; }
  try { sessionStorage.setItem("campusos:intro", "1"); } catch (_) { /* ignore */ }
  const count = $("#pre-count"), bar = $("#pre-bar");
  const t0 = performance.now(), dur = 1300;
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    count.textContent = String(Math.round(e * 100));
    bar.style.transform = "scaleX(" + e + ")";
    if (p < 1) return requestAnimationFrame(step);
    setTimeout(() => {
      pre.classList.add("done");
      const app = $("#app");
      if (app) reveal(app);
      setTimeout(() => pre.remove(), 1300);
    }, 150);
  })(t0);
  return true;
}

// ---------- boot ----------
async function boot() {
  try {
    await loadStore();
  } catch (e) {
    console.error(e);
    $("#app").innerHTML = '<div class="page"><div class="empty"><p class="h-sm">Could not load your data</p><p>' + esc(e.message) + "</p></div></div>";
    $("#preloader").remove();
    return;
  }
  applyTheme(store.data.settings.theme);
  buildMenu();
  bindMenu();
  clock(); setInterval(clock, 20000);
  const introRunning = intro();
  show({ defer: introRunning });
  sync.init();
  initHaptics();
  const refreshProfile = initProfile();
  startReminders(() => store.data);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("Offline mode unavailable:", e));
    navigator.serviceWorker.addEventListener("message", ev => { if (ev.data && ev.data.type === "go" && ev.data.url) location.hash = String(ev.data.url).replace(/^.*#/, "#"); });
  }
  const startOnboarding = () => maybeOnboard();
  if (introRunning) setTimeout(startOnboarding, 1900); else startOnboarding();
  sync.onSyncChange(() => {
    menuStorage();
    if (current === settings_route() && !$("#dlg").open) show({ keep: true });
  });

  window.addEventListener("hashchange", () => { setMenu(false); show(); });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => applyTheme(store.data.settings.theme));
  let lastTheme = store.data.settings.theme;
  subscribe(ev => {
    if (ev.type === "status") {
      const dot = $("#save-dot");
      dot.className = "save-dot" + (store.status === "saving" ? " saving" : store.status === "error" ? " error" : "");
      dot.title = store.status === "error" ? "Couldn't save to disk — kept in the browser instead" : store.status === "saving" ? "Saving…" : "Saved";
      return;
    }
    refreshProfile();
    if (store.data.settings.theme !== lastTheme) { lastTheme = store.data.settings.theme; applyTheme(lastTheme); }
    show({ keep: true });
  });
  if (store.mode === "browser" && location.hostname && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && !store.data.subjects.length && !store.data.profile.name) {
    setTimeout(() => toast("Your data is saved in this browser only — back it up in Settings"), 2500);
  }
}
boot();
