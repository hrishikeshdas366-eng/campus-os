import { esc, today, addDays, plural, toast, subjectOptions, fmtDate } from "../ui.js";
import { update, uid } from "../store.js";
import { pageHead } from "./common.js";

// Timer state lives at module level so it keeps running while you visit other pages.
const T = { mode: "focus", running: false, endsAt: 0, remaining: null, timer: 0, subjectId: "", label: "" };
let dataRef = null;

const secsFor = (d, mode) => (mode === "focus" ? d.settings.focusMinutes || 25 : d.settings.breakMinutes || 5) * 60;
const mmss = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(t => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.15, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.22);
    });
  } catch (_) { /* no audio */ }
}

function paint() {
  const d = dataRef; if (!d) return;
  const total = secsFor(d, T.mode);
  const rem = T.remaining == null ? total : T.remaining;
  const clock = document.getElementById("f-clock");
  if (clock) clock.textContent = mmss(rem);
  const ring = document.getElementById("f-ring");
  if (ring) ring.style.strokeDashoffset = String(565.5 * (1 - (total - rem) / total));
  if (T.running && location.hash === "#/focus") document.title = mmss(rem) + " · Focus";
}

function tick() {
  T.remaining = Math.max(0, Math.round((T.endsAt - Date.now()) / 1000));
  paint();
  if (T.remaining <= 0) finish();
}

function finish() {
  clearInterval(T.timer); T.running = false;
  const d = dataRef;
  beep();
  if (T.mode === "focus") {
    const minutes = d.settings.focusMinutes || 25;
    const rec = { id: uid(), date: today(), minutes, subjectId: T.subjectId, label: T.label };
    T.mode = "break"; T.remaining = null;
    toast("Focus session done — " + minutes + " min logged. Take a break.");
    update(dd => dd.focus.push(rec));
  } else {
    T.mode = "focus"; T.remaining = null;
    toast("Break over — ready for the next session?");
    update(() => {});
  }
  if (location.hash !== "#/focus") document.title = "Campus OS";
}

function start(d) {
  if (T.remaining == null) T.remaining = secsFor(d, T.mode);
  T.running = true; T.endsAt = Date.now() + T.remaining * 1000;
  clearInterval(T.timer); T.timer = setInterval(tick, 250);
}
function pause() { clearInterval(T.timer); T.running = false; tick_safe(); }
function tick_safe() { if (T.endsAt) T.remaining = Math.max(0, Math.round((T.endsAt - Date.now()) / 1000)); }

export function render(root, d, ctx) {
  dataRef = d;
  const t = today();
  const total = secsFor(d, T.mode);
  const rem = T.remaining == null ? total : T.remaining;
  const sum = fromDate => d.focus.filter(x => x.date >= fromDate).reduce((s, x) => s + x.minutes, 0);
  const todayMin = d.focus.filter(x => x.date === t).reduce((s, x) => s + x.minutes, 0);
  const weekMin = sum(addDays(t, -6));
  const days = new Set(d.focus.map(x => x.date));
  let streak = 0, cursor = days.has(t) ? t : addDays(t, -1);
  while (days.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const bars = [];
  for (let i = 6; i >= 0; i--) { const ds = addDays(t, -i); bars.push({ ds, min: d.focus.filter(x => x.date === ds).reduce((s, x) => s + x.minutes, 0) }); }
  const maxBar = Math.max(30, ...bars.map(b => b.min));
  const recent = d.focus.slice().reverse().slice(0, 8);

  root.innerHTML = '<div class="page">' +
    pageHead("09", "Focus", '<div class="seg"><button data-a="mode" data-m="focus" class="' + (T.mode === "focus" ? "on" : "") + '">Focus</button><button data-a="mode" data-m="break" class="' + (T.mode === "break" ? "on" : "") + '">Break</button></div>', "Pomodoro timer") +
    '<section class="timer fade-up" style="--d:.2s"><div style="position:relative;width:min(100%,420px)"><svg viewBox="0 0 200 200" style="width:100%;transform:rotate(-90deg)" aria-hidden="true">' +
      '<circle cx="100" cy="100" r="90" fill="none" stroke="var(--line)" stroke-width="2"/><circle id="f-ring" cx="100" cy="100" r="90" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="565.5" stroke-dashoffset="' + 565.5 * (1 - (total - rem) / total) + '"/></svg>' +
      '<div class="num" id="f-clock" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(54px,12vw,96px)">' + mmss(rem) + "</div></div>" +
      '<div class="row" style="justify-content:center"><button class="btn solid" data-a="toggle">' + (T.running ? "Pause" : (T.remaining != null && T.remaining < total ? "Resume" : "Start")) + '</button><button class="btn" data-a="reset">Reset</button></div>' +
      '<div class="row" style="justify-content:center;width:min(100%,520px)"><select id="f-sub" style="flex:1;min-width:150px">' + subjectOptions(d.subjects, true, "No subject").map(o => '<option value="' + esc(o.value) + '"' + (o.value === T.subjectId ? " selected" : "") + ">" + esc(o.label) + "</option>").join("") + "</select>" +
      '<input id="f-label" placeholder="What are you working on?" value="' + esc(T.label) + '" style="flex:2;min-width:180px" maxlength="80"></div></section>' +
    '<section class="section"><div class="grid g4"><div class="card stat"><div class="label mono">Today</div><div class="num">' + todayMin + '<span class="faint" style="font-size:.4em"> min</span></div></div>' +
      '<div class="card stat"><div class="label mono">Last 7 days</div><div class="num">' + (Math.round(weekMin / 6) / 10) + '<span class="faint" style="font-size:.4em"> h</span></div></div>' +
      '<div class="card stat"><div class="label mono">Streak</div><div class="num">' + streak + '<span class="faint" style="font-size:.4em"> ' + (streak === 1 ? "day" : "days") + '</span></div></div>' +
      '<div class="card stat"><div class="label mono">Sessions</div><div class="num">' + d.focus.length + "</div></div></div></section>" +
    '<section class="section"><div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start"><div><div class="section-head"><h2 class="h-md">This week</h2></div>' +
      '<div style="display:flex;align-items:flex-end;gap:10px;height:150px">' + bars.map(b => '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><div style="width:100%;border-radius:6px 6px 0 0;background:' + (b.ds === t ? "var(--ink)" : "var(--ink-3)") + ';height:' + Math.max(2, b.min / maxBar * 100) + '%" title="' + b.min + ' min"></div><span class="mono faint" style="font-size:10px">' + esc(fmtDate(b.ds).slice(0, 3)) + "</span></div>").join("") + "</div></div>" +
      '<div><div class="section-head"><h2 class="h-md">Recent</h2></div>' + (recent.length ? '<div class="list">' + recent.map(x => '<div class="item"><span class="mono muted" style="width:90px;flex:none">' + esc(fmtDate(x.date, { weekday: false })) + '</span><div class="grow"><div class="title">' + esc(x.label || (d.subjects.find(s => s.id === x.subjectId) || {}).name || "Focus session") + '</div></div><span class="mono">' + x.minutes + " min</span></div>").join("") + "</div>" : '<p class="muted">Finished sessions are logged here.</p>') + "</div></div></section></div>";

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "toggle") { T.running ? pause() : start(d); ctx.refresh(); }
    else if (a === "reset") { clearInterval(T.timer); T.running = false; T.remaining = null; document.title = "Focus · Campus OS"; ctx.refresh(); }
    else if (a === "mode") { clearInterval(T.timer); T.running = false; T.remaining = null; T.mode = b.dataset.m; ctx.refresh(); }
  });
  root.querySelector("#f-sub").addEventListener("change", e => { T.subjectId = e.target.value; });
  root.querySelector("#f-label").addEventListener("input", e => { T.label = e.target.value; });
  paint();
}
