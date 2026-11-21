// "Right now" card on Home: the class in progress (with countdown + one-tap marking), or what's next.
import { esc, today, nowMinutes, toMin, fmtTime, fmtDate, addDays, plural, DAYS_LONG, weekday } from "../ui.js";
import { classesOn } from "../calc.js";

const dur = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? h + " h" + (r ? " " + r + " min" : "") : m + " min"; };

export function nowState(d) {
  const t = today(), now = nowMinutes();
  const list = classesOn(d, t).map(c => {
    const s = toMin(c.start), e = toMin(c.end) != null ? toMin(c.end) : (s != null ? s + 60 : null);
    return { c, s, e, rec: d.attendance.find(r => r.date === t && r.slotId === c.id), subj: d.subjects.find(x => x.id === c.subjectId) };
  }).filter(x => x.s != null && x.subj);
  if (!list.length && !d.timetable.length) return null;
  const cur = list.find(x => x.s <= now && now < x.e);
  const pend = list.filter(x => x.e <= now && !x.rec).sort((a, b) => b.e - a.e)[0];
  const nxt = list.find(x => x.s > now);
  const done = list.filter(x => x.rec && x.rec.status === "present").length;
  let tomorrow = null;
  if (!cur && !nxt) {
    for (let k = 1; k <= 7 && !tomorrow; k++) {
      const ds = addDays(t, k), cs = classesOn(d, ds);
      if (cs.length) tomorrow = { date: ds, first: cs[0], subj: d.subjects.find(x => x.id === cs[0].subjectId), count: cs.length };
    }
  }
  return { now, list, cur, pend, nxt, done, tomorrow, t };
}

function acts(x) {
  if (x.rec) return '<div class="nc-marked mono">Marked ' + esc(x.rec.status) + ' ✓</div><button class="btn xs ghost" data-ca="unmark" data-rec="' + x.rec.id + '">Undo</button>';
  return [["present", "Present", "good-b"], ["absent", "Absent", "bad-b"], ["cancelled", "Cancelled", ""]].map(a =>
    '<button class="btn sm ' + a[2] + '" data-ca="mark" data-st="' + a[0] + '" data-sub="' + x.c.subjectId + '" data-slot="' + x.c.id + '">' + a[1] + "</button>").join("");
}

function rail(st) {
  const L = st.list; if (!L.length) return "";
  const lo = Math.floor((Math.min(...L.map(x => x.s)) - 30) / 60) * 60, hi = Math.ceil((Math.max(...L.map(x => x.e)) + 30) / 60) * 60;
  const span = hi - lo, p = v => Math.max(0, Math.min(100, (v - lo) / span * 100));
  const blocks = L.map(x => '<i class="nc-blk' + (x.rec ? " " + x.rec.status : "") + (st.cur === x ? " live" : "") + '" style="left:' + p(x.s) + "%;width:" + (p(x.e) - p(x.s)) + "%;--c:" + esc(x.subj.color || "var(--ink)") + '" title="' + esc(x.subj.name + " " + fmtTime(x.c.start)) + '"></i>').join("");
  return '<div class="nc-rail" data-lo="' + lo + '" data-span="' + span + '">' + blocks + '<b class="nc-now" style="left:' + p(st.now) + '%"></b></div>' +
    '<div class="nc-rail-lab mono"><span>' + fmtTime(String(Math.floor(lo / 60)).padStart(2, "0") + ":00") + "</span><span>" + fmtTime(String(Math.floor(hi / 60) % 24).padStart(2, "0") + ":00") + "</span></div>";
}

export function nowCard(d) {
  const st = nowState(d);
  if (!st) return "";
  let kicker, title, meta = "", body = "", live = false, key;
  if (st.cur) {
    const x = st.cur, left = x.e - st.now, pc = Math.round((st.now - x.s) / (x.e - x.s) * 100);
    key = "cur:" + x.c.id; live = true;
    kicker = "Now · " + fmtTime(x.c.start) + "–" + fmtTime(x.c.end || "");
    title = x.subj.name; meta = [x.c.kind, x.c.room && "Room " + String(x.c.room).replace(/^room\s*/i, "")].filter(Boolean).join(" · ");
    body = '<div class="nc-prog"><i data-prog style="width:' + pc + '%"></i></div><div class="nc-count"><span data-left="' + x.e + '">' + esc(dur(left)) + " left</span></div>" + '<div class="nc-acts">' + acts(x) + "</div>";
  } else if (st.pend) {
    const x = st.pend;
    key = "pend:" + x.c.id;
    kicker = "Just ended · " + fmtTime(x.c.end || "");
    title = "Did you attend " + x.subj.name + "?"; meta = [x.c.kind, x.c.room].filter(Boolean).join(" · ");
    body = '<div class="nc-acts">' + acts(x) + "</div>";
  } else if (st.nxt) {
    const x = st.nxt, until = x.s - st.now;
    key = "nxt:" + x.c.id;
    kicker = "Up next · " + fmtTime(x.c.start);
    title = x.subj.name; meta = [x.c.kind, x.c.room && "Room " + String(x.c.room).replace(/^room\s*/i, "")].filter(Boolean).join(" · ");
    body = '<div class="nc-count"><span data-until="' + x.s + '">Starts in ' + esc(dur(until)) + "</span></div>";
  } else if (st.list.length) {
    key = "done";
    kicker = "Today";
    title = "That's a wrap.";
    meta = "You marked " + plural(st.done, "class", "classes") + " present of " + st.list.length + " today.";
    if (st.tomorrow) body = '<div class="nc-next">Next: <b>' + esc(st.tomorrow.subj ? st.tomorrow.subj.name : "Class") + "</b> " + esc(fmtTime(st.tomorrow.first.start)) + " on " + esc(DAYS_LONG[weekday(st.tomorrow.date)]) + "</div>";
  } else {
    key = "free";
    kicker = "Today";
    title = "No classes today.";
    meta = st.tomorrow ? "" : "Enjoy the free day.";
    if (st.tomorrow) body = '<div class="nc-next">Next: <b>' + esc(st.tomorrow.subj ? st.tomorrow.subj.name : "Class") + "</b> " + esc(fmtTime(st.tomorrow.first.start)) + " on " + esc(DAYS_LONG[weekday(st.tomorrow.date)]) + "</div>";
  }
  let after = "";
  if (st.cur) { const n = st.list.find(x => x.s >= st.cur.e); if (n) after = '<div class="nc-next">Then: <b>' + esc(n.subj.name) + "</b> at " + esc(fmtTime(n.c.start)) + (n.c.room ? " · " + esc(n.c.room) : "") + "</div>"; }
  return '<section class="nowcard' + (live ? " live" : "") + '" id="nowcard" data-key="' + esc(key) + '">' +
    '<div class="nc-top"><span class="mono">' + esc(kicker) + "</span>" + (live ? '<span class="nc-live mono"><i></i>Live</span>' : "") + "</div>" +
    '<div class="nc-title">' + esc(title) + "</div>" + (meta ? '<div class="nc-meta">' + esc(meta) + "</div>" : "") + body + after +
    (st.list.length ? rail(st) : "") + "</section>";
}

/** Keep the countdown honest without re-rendering the page; rebuild just the card when the situation changes. */
export function liveNow(root, d) {
  const id = setInterval(() => {
    const el = root.querySelector("#nowcard");
    if (!el || !el.isConnected) return;
    const now = nowMinutes();
    const next = nowCard(d);
    const m = next.match(/data-key="([^"]*)"/);
    if (!m || m[1] !== el.dataset.key) { const tmp = document.createElement("div"); tmp.innerHTML = next; el.replaceWith(tmp.firstElementChild); return; }
    const left = el.querySelector("[data-left]");
    if (left) { const e = Number(left.dataset.left); left.textContent = dur(e - now) + " left"; }
    const until = el.querySelector("[data-until]");
    if (until) { until.textContent = "Starts in " + dur(Number(until.dataset.until) - now); }
    const nowMark = el.querySelector(".nc-now"), rl = el.querySelector(".nc-rail");
    if (nowMark && rl) nowMark.style.left = Math.max(0, Math.min(100, (now - Number(rl.dataset.lo)) / Number(rl.dataset.span) * 100)) + "%";
  }, 15000);
  return () => clearInterval(id);
}
