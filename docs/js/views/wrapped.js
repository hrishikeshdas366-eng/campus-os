// Semester Wrapped — your semester as a story you can tap through, ending in a shareable card.
import { esc, pct, plural, DAYS_LONG, fmtDate, toast } from "../ui.js";
import { streak } from "../insights.js";
import { subjectStats } from "../calc.js";
import { haptic } from "../haptics.js";

export function wrappedStats(d) {
  const subs = new Map(d.subjects.map(s => [s.id, s]));
  const recs = d.attendance.filter(r => subs.has(r.subjectId));
  const present = recs.filter(r => r.status === "present").length, absent = recs.filter(r => r.status === "absent").length;
  const total = present + absent;
  const dates = recs.map(r => r.date).sort();
  const perSub = d.subjects.filter(s => !s.archived).map(s => ({ s, st: subjectStats(d, s) })).filter(x => x.st.total >= 3);
  perSub.sort((a, b) => b.st.percent - a.st.percent);
  const byDay = Array(7).fill(0), byDayAbs = Array(7).fill(0);
  recs.forEach(r => { const wd = (new Date(r.date + "T00:00").getDay() + 6) % 7; if (r.status === "present") byDay[wd]++; else if (r.status === "absent") byDayAbs[wd]++; });
  const maxAbs = Math.max(...byDayAbs), maxPres = Math.max(...byDay);
  const fMin = d.focus.reduce((a, f) => a + (Number(f.minutes) || 0), 0);
  const fDays = new Set(d.focus.map(f => f.date)).size;
  const fLongest = d.focus.reduce((a, f) => Math.max(a, Number(f.minutes) || 0), 0);
  const fBySub = {};
  d.focus.forEach(f => { const n = (subs.get(f.subjectId) || {}).name || f.label; if (n) fBySub[n] = (fBySub[n] || 0) + (Number(f.minutes) || 0); });
  const fTop = Object.entries(fBySub).sort((a, b) => b[1] - a[1])[0] || null;
  const done = d.tasks.filter(x => x.done);
  const withDue = done.filter(x => x.due && x.doneAt);
  const onTime = withDue.length ? Math.round(withDue.filter(x => x.doneAt <= x.due).length / withDue.length * 100) : null;
  const spent = d.money.filter(m => m.kind === "expense");
  const spendTotal = spent.reduce((a, m) => a + Number(m.amount), 0);
  const cats = {}; spent.forEach(m => { cats[m.category] = (cats[m.category] || 0) + Number(m.amount); });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0] || null;
  const st = streak(d);
  return {
    present, absent, total, pct: total ? present / total * 100 : null, first: dates[0] || null, last: dates[dates.length - 1] || null,
    best: perSub[0] || null, worst: perSub.length > 1 ? perSub[perSub.length - 1] : null,
    skipDay: maxAbs >= 2 ? byDayAbs.indexOf(maxAbs) : -1, topDay: maxPres ? byDay.indexOf(maxPres) : -1,
    focus: { min: fMin, hours: fMin / 60, days: fDays, longest: fLongest, sessions: d.focus.length, top: fTop },
    tasks: { done: done.length, all: d.tasks.length, onTime },
    money: { total: spendTotal, top: topCat, n: spent.length },
    streak: st.best,
  };
}

function slides(d, w) {
  const name = (d.profile.name || "").split(" ")[0];
  const cur = d.settings.currency || "₹";
  const S = [];
  S.push({ k: "Semester Wrapped", big: name ? esc(name) + "," : "Hey,", line: "here's your semester in numbers.", sub: w.first ? fmtDate(w.first, { year: true }) + " → " + fmtDate(w.last, { year: true }) : "So far", text: true });
  if (w.total) S.push({ k: "Showing up", n: w.present, line: "classes attended" + (w.absent ? " · " + w.absent + " missed" : ""), sub: pct(w.pct) + "% attendance overall", invert: true });
  if (w.streak >= 2) S.push({ k: "Consistency", n: w.streak, unit: "days", line: "longest streak without missing a class", sub: "◆ Your best run" });
  if (w.best) S.push({ k: "Most reliable", big: esc(w.best.s.name), line: pct(w.best.st.percent) + "% attendance", sub: w.worst && w.worst.s.id !== w.best.s.id ? "Needs love: " + esc(w.worst.s.name) + " at " + pct(w.worst.st.percent) + "%" : "", invert: true, text: true });
  if (w.skipDay >= 0) S.push({ k: "Your pattern", big: esc(DAYS_LONG[w.skipDay]), line: "is the day you miss class most", sub: w.topDay >= 0 ? "You're most present on " + DAYS_LONG[w.topDay] + "s" : "", text: true });
  if (w.focus.min >= 30) S.push({ k: "Deep work", n: Math.round(w.focus.hours * 10) / 10, unit: "hours", dec: 1, line: "of focused study across " + plural(w.focus.sessions, "session"), sub: (w.focus.top ? "Most time on " + esc(w.focus.top[0]) + " · " : "") + "longest session " + w.focus.longest + " min", invert: true });
  if (w.tasks.done) S.push({ k: "Getting things done", n: w.tasks.done, line: "tasks finished" + (w.tasks.all ? " of " + w.tasks.all : ""), sub: w.tasks.onTime != null ? w.tasks.onTime + "% on time" : "" });
  if (w.money.n >= 3) S.push({ k: "Money (just for you)", n: Math.round(w.money.total), pre: cur, line: "spent in total", sub: w.money.top ? "Mostly on " + esc(w.money.top[0]) : "", invert: true, private: true });
  S.push({ k: "Summary", card: true });
  return S;
}

function slideHtml(s, i) {
  if (s.card) return '<section class="wr-slide" data-i="' + i + '"><p class="wr-k mono">Your card</p><canvas id="wr-card" class="wr-card" width="1080" height="1350"></canvas>' +
    '<div class="wr-share"><button class="btn solid" id="wr-share">Share</button><button class="btn" id="wr-save">Save image</button></div></section>';
  const big = s.text ? '<div class="wr-text">' + s.big + "</div>" : '<div class="wr-num num"' + (s.n != null ? ' data-n="' + s.n + '" data-dec="' + (s.dec || 0) + '"' : "") + ">" + (s.pre ? '<span class="wr-pre">' + esc(s.pre) + "</span>" : "") + '<span data-v>0</span>' + (s.unit ? '<span class="wr-unit">' + esc(s.unit) + "</span>" : "") + "</div>";
  return '<section class="wr-slide' + (s.invert ? " inv" : "") + '" data-i="' + i + '"><p class="wr-k mono">' + esc(s.k) + "</p>" + big + '<p class="wr-line">' + (s.line || "") + '</p><p class="wr-sub mono">' + (s.sub || "") + "</p>" + (s.private ? '<p class="wr-priv mono">Not included on your share card</p>' : "") + "</section>";
}

function countUp(el) {
  const v = el.querySelector("[data-v]"); if (!v) return;
  const n = Number(el.dataset.n), dec = Number(el.dataset.dec || 0);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !isFinite(n)) { v.textContent = n.toLocaleString(undefined, { maximumFractionDigits: dec }); return; }
  const t0 = performance.now(), D = 1100;
  (function f(now) {
    const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
    v.textContent = (n * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (p < 1 && el.isConnected) requestAnimationFrame(f);
  })(t0);
}

function drawCard(c, d, w) {
  const x = c.getContext("2d"), W = c.width, H = c.height;
  const name = (d.profile.name || "").trim();
  x.fillStyle = "#0b0b0b"; x.fillRect(0, 0, W, H);
  // hairline fan, echoing the home hero
  x.strokeStyle = "#f4f4f0"; x.lineWidth = 1.2;
  for (let i = 0; i < 70; i++) {
    const f = i / 69, a = Math.PI + f * Math.PI / 2 * 1.02;
    x.globalAlpha = 0.05 + 0.12 * (0.5 + 0.5 * Math.sin(f * 20));
    x.beginPath(); x.moveTo(W * 1.04, H * 1.04);
    x.quadraticCurveTo(W * 1.04 + Math.cos(a + .25) * W * .7, H * 1.04 + Math.sin(a + .25) * W * .7, W * 1.04 + Math.cos(a) * W * 1.5, H * 1.04 + Math.sin(a) * W * 1.5);
    x.stroke();
  }
  x.globalAlpha = 1; x.fillStyle = "#f4f4f0";
  x.font = "600 30px ui-monospace, Menlo, monospace"; x.fillText("CAMPUS OS  ·  SEMESTER WRAPPED", 80, 110);
  x.font = "700 56px -apple-system, Helvetica, Arial"; x.fillText(name || "My semester", 80, 210);
  x.font = "700 330px -apple-system, Helvetica, Arial"; x.fillText(w.pct != null ? pct(w.pct) + "%" : "—", 70, 560);
  x.font = "500 38px ui-monospace, Menlo, monospace"; x.fillStyle = "#a6a6a1"; x.fillText("ATTENDANCE", 80, 625);
  const rows = [[String(w.present), "classes attended"], [String(w.streak || 0), "day best streak"], [(Math.round(w.focus.hours * 10) / 10) + " h", "focused"], [String(w.tasks.done), "tasks done"]];
  rows.forEach((r, i) => {
    const cx = 80 + (i % 2) * 480, cy = 800 + Math.floor(i / 2) * 230;
    x.fillStyle = "#f4f4f0"; x.font = "700 120px -apple-system, Helvetica, Arial"; x.fillText(r[0], cx, cy);
    x.fillStyle = "#a6a6a1"; x.font = "500 34px ui-monospace, Menlo, monospace"; x.fillText(r[1].toUpperCase(), cx, cy + 52);
  });
  x.fillStyle = "#6c6c68"; x.font = "500 30px ui-monospace, Menlo, monospace"; x.fillText(location.host || "campus-os", 80, H - 70);
}

export function render(root, d, ctx) {
  const w = wrappedStats(d);
  if (!w.total && !d.focus.length && !d.tasks.length) {
    root.innerHTML = '<div class="page"><div class="empty" style="margin-top:20vh"><p class="h-sm">Wrapped needs a little data</p><p>Mark some classes, finish a task or run a focus session — then come back for your semester in numbers.</p><p><a class="btn sm" href="#/attendance">Go to Attendance</a></p></div></div>';
    return;
  }
  const S = slides(d, w);
  document.body.classList.add("wr-open");
  root.innerHTML = '<div class="wr" id="wr" tabindex="-1"><div class="wr-bars">' + S.map(() => "<i><b></b></i>").join("") + "</div>" +
    '<button class="wr-x mono" id="wr-x" aria-label="Close">Close ✕</button><div class="wr-stage">' + S.map(slideHtml).join("") + '</div><div class="wr-hint mono">Tap to continue · swipe or use ← →</div>' +
    '<button class="wr-nav l" aria-label="Previous"></button><button class="wr-nav r" aria-label="Next"></button></div>';
  const el = root.querySelector("#wr"), slidesEl = [...el.querySelectorAll(".wr-slide")], bars = [...el.querySelectorAll(".wr-bars i")];
  let i = 0;
  function go(n, quiet) {
    n = Math.max(0, Math.min(S.length - 1, n));
    if (n === i && el.dataset.ready) return;
    i = n; el.dataset.ready = "1";
    slidesEl.forEach((s, k) => s.classList.toggle("on", k === i));
    bars.forEach((b, k) => b.classList.toggle("done", k < i) || b.classList.toggle("cur", k === i));
    el.classList.toggle("inv", !!S[i].invert);
    el.querySelector(".wr-hint").style.visibility = i === S.length - 1 ? "hidden" : "";
    const num = slidesEl[i].querySelector(".wr-num"); if (num && num.dataset.n != null) countUp(num);
    if (S[i].card) drawCard(el.querySelector("#wr-card"), d, w);
    if (!quiet) haptic();
  }
  go(0, true);
  el.querySelector(".wr-nav.r").onclick = () => go(i + 1);
  el.querySelector(".wr-nav.l").onclick = () => go(i - 1);
  el.querySelector("#wr-x").onclick = () => { location.hash = "#/"; };
  let sx = null;
  el.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }, { passive: true });
  const key = e => { if (e.key === "ArrowRight" || e.key === " ") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); else if (e.key === "Escape") location.hash = "#/"; };
  document.addEventListener("keydown", key);
  const cardBlob = () => new Promise(r => el.querySelector("#wr-card").toBlob(r, "image/png"));
  el.querySelector("#wr-share")?.addEventListener("click", async () => {
    const blob = await cardBlob(); if (!blob) return;
    const file = new File([blob], "my-semester-wrapped.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "My semester on Campus OS" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    save(blob);
  });
  el.querySelector("#wr-save")?.addEventListener("click", async () => { const b = await cardBlob(); if (b) save(b); });
  function save(blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-semester-wrapped.png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("Image saved"); }
  return () => { document.removeEventListener("keydown", key); document.body.classList.remove("wr-open"); };
}
