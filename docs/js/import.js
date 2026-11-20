// Import a timetable from a photo, screenshot, PDF or pasted text.
// Everything is read ON THIS DEVICE (OCR via Tesseract.js, PDFs via pdf.js — both loaded on demand),
// then you review and fix the result before anything is saved.
import { store, update, uid } from "./store.js";
import { esc, toast, PALETTE, DAYS_LONG, toMin } from "./ui.js";

const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const KINDS = ["Lecture", "Lab", "Tutorial", "Seminar", "Practical"];

// ====================================================================== parsing
const DAY_RE = /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/i;
const DAY_IDX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const T = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*([ap]\\.?m\\.?)?";
const RANGE_SRC = T + "\\s*(?:-|–|—|to|till|until)\\s*" + T;
const dayOf = s => { const m = String(s).match(DAY_RE); return m ? DAY_IDX[m[1].slice(0, 3).toLowerCase()] : null; };
const p2 = n => String(n).padStart(2, "0");

/** regex match of a time range -> {start:"HH:MM", end:"HH:MM"} or null */
function rangeFrom(m) {
  let h1 = +m[1], m1 = +(m[2] || 0), a1 = m[3], h2 = +m[4], m2 = +(m[5] || 0), a2 = m[6];
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  const conv = (h, ap) => { const pm = /p/i.test(ap); if (pm && h < 12) return h + 12; if (!pm && h === 12) return 0; return h; };
  let a, b;
  if (a1 && a2) { a = conv(h1, a1); b = conv(h2, a2); }
  else if (a2) { a = conv(h1, a2); b = conv(h2, a2); if (a >= b) a -= 12; }
  else if (a1) { a = conv(h1, a1); b = conv(h2, a1); if (b <= a) b += 12; }
  else {
    a = h1 >= 1 && h1 <= 6 ? h1 + 12 : h1;
    b = h2 >= 1 && h2 <= 6 ? h2 + 12 : h2;
    if (b <= a && b + 12 <= 24) b += 12;
  }
  const s = a * 60 + m1, e = b * 60 + m2;
  if (a < 0 || b > 24 || e - s < 20 || e - s > 360) return null;
  return { start: p2(a) + ":" + p2(m1), end: p2(b) + ":" + p2(m2) };
}
const rangesIn = text => [...String(text).matchAll(new RegExp(RANGE_SRC, "ig"))].map(m => ({ m, r: rangeFrom(m) })).filter(x => x.r);

const SKIP_CELL = /^(?:[-–—_.]*|break|lunch(?: break)?|recess|free|library|n\/?a|nil|tea|snacks?|interval)$/i;

/** one table cell / text fragment -> {subject, code, room, kind} or null */
function parseCell(text) {
  let t = String(text).replace(/\s+/g, " ").trim();
  // classic OCR slip: a zero read in place of the letter O at the start of a word ("0S" -> "OS", "0perating" -> "Operating")
  t = t.replace(/\b0([A-Za-z]{1,2})\b/g, (_, x) => "O" + x.toUpperCase()).replace(/\b0(?=[a-z]{3,})/g, "O");
  if (!t || SKIP_CELL.test(t)) return null;
  const kindM = t.match(/\b(lab|practical|tutorial|seminar|workshop)\b/i);
  let kind = "Lecture";
  if (kindM) { const k = kindM[1].toLowerCase(); kind = k === "workshop" ? "Practical" : k[0].toUpperCase() + k.slice(1); }
  let room = "", m = t.match(/\b(?:room|rm|hall|block)\.?\s*[-:#]?\s*[A-Za-z0-9][A-Za-z0-9\-\/]{0,8}/i);
  if (m) { room = m[0].replace(/\s+/g, " ").trim(); t = t.replace(m[0], " "); }
  else if ((m = t.match(/\(?\b[A-Z]{1,2}-\d{2,4}\b\)?/))) { room = m[0].replace(/[()]/g, ""); t = t.replace(m[0], " "); }
  let code = "";
  if ((m = t.match(/\b[A-Z]{2,4}\s?-?\d{3}[A-Z]?\b/))) { code = m[0].replace(/[\s-]/g, ""); t = t.replace(m[0], " "); }
  t = t.replace(/[()\[\]|:;,]+/g, " ").replace(/\s+/g, " ").replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim();
  if (t.length < 2 && !code) return null;
  return { subject: t || code, code, room, kind };
}

const splitCells = line => line.split(/\t|\|/).map(c => c.trim());

/** Free text (OCR / PDF / pasted) -> [{day,start,end,subject,code,room,kind,check}] */
export function parseTimetable(text) {
  const lines = String(text).replace(/\r/g, "").split("\n")
    .map(l => l.replace(/[  ]{3,}/g, "\t").replace(/[  ]+/g, " ").trim()).filter(Boolean);
  const grid = parseGrid(lines);
  const list = parseList(lines);
  const best = grid.length >= list.length ? grid : list;
  const seen = new Set();
  return best.filter(r => { const k = [r.day, r.start, r.end, r.subject.toLowerCase()].join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
}

function parseGrid(lines) {
  const out = [];
  // A) times across the top, days down the side
  const hi = lines.findIndex(l => rangesIn(l).length >= 3);
  if (hi >= 0) {
    const times = rangesIn(lines[hi]).map(x => x.r);
    lines.slice(hi + 1).forEach(l => {
      const cells = splitCells(l);
      const d = dayOf(cells[0] || "");
      if (d == null || (cells[0] || "").split(" ").length > 3) return;
      const body = cells.slice(1).filter((c, i, arr) => !(c === "" && i === arr.length - 1));
      const check = body.length > times.length || (body.length < times.length && !body.includes("") && !body.some(c => /^[-–—]+$/.test(c)));
      body.forEach((c, i) => { const slot = times[i]; const cell = parseCell(c); if (slot && cell) out.push({ day: d, start: slot.start, end: slot.end, check, ...cell }); });
    });
    if (out.length) return out;
  }
  // B) days across the top, times down the side
  const di = lines.findIndex(l => { const ds = new Set((l.match(new RegExp(DAY_RE.source, "ig")) || []).map(x => dayOf(x))); return ds.size >= 3 && rangesIn(l).length === 0; });
  if (di >= 0) {
    const days = (lines[di].match(new RegExp(DAY_RE.source, "ig")) || []).map(x => dayOf(x));
    lines.slice(di + 1).forEach(l => {
      const cells = splitCells(l);
      const rg = rangesIn(cells[0] || "")[0];
      if (!rg) return;
      const body = cells.slice(1);
      const check = body.length > days.length || (body.length < days.length && !body.includes("") && !body.some(c => /^[-–—]+$/.test(c)));
      body.forEach((c, i) => { const cell = parseCell(c); if (cell && days[i] != null) out.push({ day: days[i], start: rg.r.start, end: rg.r.end, check, ...cell }); });
    });
  }
  return out;
}

function parseList(lines) {
  const out = [];
  let cur = null;
  lines.forEach(line => {
    const rs = rangesIn(line);
    const dm = line.match(DAY_RE);
    const lineDay = dm ? dayOf(dm[0]) : null;
    if (lineDay != null && !rs.length) { cur = lineDay; return; }
    if (!rs.length) return;
    const day = lineDay != null ? lineDay : cur;
    if (day == null) return;
    if (lineDay != null) cur = lineDay;
    // text between / after the time ranges belongs to the preceding range
    const work = line.replace(new RegExp(DAY_RE.source, "ig"), " ");
    const rr = rangesIn(work);
    rr.forEach((x, i) => {
      const from = x.m.index + x.m[0].length;
      const to = i + 1 < rr.length ? rr[i + 1].m.index : work.length;
      let chunk = work.slice(from, to);
      if (!chunk.trim() && i === 0) chunk = work.slice(0, x.m.index);   // "Data Structures 9-10"
      const cell = parseCell(chunk);
      if (cell) out.push({ day, start: x.r.start, end: x.r.end, check: false, ...cell });
    });
  });
  return out;
}

// ====================================================================== reading images / PDFs
const loaded = {};
function loadScript(url) {
  if (loaded[url]) return loaded[url];
  return (loaded[url] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url; s.onload = res; s.onerror = () => { delete loaded[url]; rej(new Error("Couldn't download the reading tools — check your internet connection.")); };
    document.head.appendChild(s);
  }));
}

function bitmapToCanvas(src) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const long = Math.max(w0, h0);
  const k = long > 2600 ? 2600 / long : long < 1400 ? Math.min(2.5, 1400 / long) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(url), 5000); };
    img.onerror = () => rej(new Error("That image couldn't be opened."));
    img.src = url;
  });
}

/** OCR a canvas/image -> text with tabs where columns are far apart */
export async function ocr(canvas, onProgress) {
  await loadScript(TESS);
  const worker = await window.Tesseract.createWorker("eng", 1, { logger: m => { if (onProgress && m.status) onProgress(m.status, m.progress || 0); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(canvas);
    const lines = (data.lines || []).map(l => {
      const words = (l.words || []).filter(w => w.text && w.text.trim());
      if (!words.length) return "";
      const h = Math.max(8, words.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / words.length);
      let s = words[0].text;
      for (let i = 1; i < words.length; i++) s += (words[i].bbox.x0 - words[i - 1].bbox.x1 > h * 1.3 ? "\t" : " ") + words[i].text;
      return s;
    });
    return lines.join("\n") || data.text || "";
  } finally { try { await worker.terminate(); } catch (_) { /* ignore */ } }
}

async function pdfToText(file, onProgress) {
  await loadScript(PDFJS);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  const pages = Math.min(pdf.numPages, 4);
  for (let p = 1; p <= pages; p++) {
    onProgress("Reading page " + p + " of " + pages, p / pages);
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str, h: Math.abs(i.transform[3]) || 10 }));
    const rows = [];
    items.sort((a, b) => b.y - a.y).forEach(it => {
      const r = rows.find(r => Math.abs(r.y - it.y) < Math.max(3, it.h * 0.45));
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    });
    rows.forEach(r => {
      r.items.sort((a, b) => a.x - b.x);
      let s = r.items[0].s;
      for (let i = 1; i < r.items.length; i++) {
        const gap = r.items[i].x - (r.items[i - 1].x + r.items[i - 1].w);
        s += (gap > r.items[i].h * 0.8 ? "\t" : gap > 1 ? " " : "") + r.items[i].s;
      }
      text += s + "\n";
    });
    if (text.replace(/\s/g, "").length < 20 && p === 1) {      // scanned PDF: render and OCR instead
      onProgress("Scanned PDF — reading the picture", 0);
      const vp = page.getViewport({ scale: 2.2 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      return ocr(c, onProgress);
    }
  }
  return text;
}

export async function extractText(file, onProgress) {
  onProgress = onProgress || (() => {});
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name || "")) return pdfToText(file, onProgress);
  const img = await fileToImage(file);
  return ocr(bitmapToCanvas(img), onProgress);
}

// ====================================================================== UI
let rows = [], raw = "", replaceAll_ = false;

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function matchSubject(row, subjects) {
  const active = subjects.filter(s => !s.archived);
  const code = String(row.code || "").toLowerCase();
  if (code) { const c = active.find(s => String(s.code || "").replace(/[\s-]/g, "").toLowerCase() === code); if (c) return c; }
  const n = norm(row.subject);
  if (!n) return null;
  const bare = x => norm(x).replace(/\b(lab|labs|practical|tutorial|seminar|workshop)\b/g, " ").replace(/\s+/g, " ").trim();
  const nb = bare(row.subject);
  return active.find(s => norm(s.name) === n)
    || (nb && active.find(s => bare(s.name) === nb))
    || active.find(s => { const m = norm(s.name); return n.length >= 3 && m.length >= 3 && (m.includes(n) || n.includes(m)); }) || null;
}

function shell(inner) {
  const dlg = document.getElementById("dlg");
  dlg.classList.add("wide");
  dlg.innerHTML = '<form method="dialog" id="imp-form"><div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">Timetable</p><h2 class="h-md">Import from photo or PDF</h2></div>' +
    '<button type="button" class="btn sm icon ghost" data-close aria-label="Close">✕</button></div>' + inner + "</form>";
  dlg.querySelectorAll("[data-close]").forEach(b => { b.onclick = () => dlg.close(); });
  dlg.addEventListener("close", () => dlg.classList.remove("wide"), { once: true });
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function openImport() {
  stepSource();
}

function stepSource(error, prefill) {
  const dlg = shell(
    '<p class="muted" style="margin-top:0">Take a straight-on photo of your timetable, pick a screenshot, or choose the PDF your college sent. It’s read <b>on this device</b> — the image is never uploaded. You’ll review everything before it’s saved.</p>' +
    (error ? '<p class="bad" role="alert">' + esc(error) + "</p>" : "") +
    '<label class="imp-drop"><input type="file" id="imp-file" accept="image/*,application/pdf" class="hidden"><span class="h-sm">Choose a photo, screenshot or PDF</span><span class="muted" style="font-size:13px">Works best with clear, well-lit, straight-on images. First use downloads ~10 MB of reading tools.</span></label>' +
    '<details style="margin-top:16px"' + (prefill ? " open" : "") + '><summary class="mono muted" style="cursor:pointer">Or paste the timetable text</summary>' +
    '<textarea id="imp-text" rows="7" style="margin-top:10px" placeholder="Monday&#10;9:00-10:00 Data Structures (CS201) Room B-204&#10;10:00-11:00 DBMS&#10;&#10;or: Mon  9-10 Maths · 11-12 Physics">' + esc(prefill || "") + "</textarea>" +
    '<div class="row" style="margin-top:10px"><button type="button" class="btn sm" id="imp-parse">Read this text</button></div></details>');
  dlg.querySelector("#imp-file").onchange = async e => {
    const f = e.target.files[0];
    if (f) await run(f);
  };
  dlg.querySelector("#imp-parse").onclick = () => toReview(dlg.querySelector("#imp-text").value);
}

async function run(file) {
  const dlg = shell('<div class="stack" style="padding:18px 0 8px"><p class="h-sm" id="imp-status" style="margin:0">Getting ready…</p><div class="bar"><i id="imp-bar" style="width:4%"></i></div>' +
    '<p class="muted" style="font-size:13px;margin:0">Reading ' + esc(file.name || "image") + " on this device. This can take up to a minute.</p></div>");
  const status = dlg.querySelector("#imp-status"), bar = dlg.querySelector("#imp-bar");
  try {
    const text = await extractText(file, (s, p) => {
      status.textContent = s.charAt(0).toUpperCase() + s.slice(1) + "…";
      bar.style.width = Math.max(4, Math.round(p * 100)) + "%";
    });
    toReview(text);
  } catch (e) {
    console.error(e);
    stepSource(e.message || "Couldn't read that file. You can paste the text instead.");
  }
}

function toReview(text) {
  raw = text || "";
  rows = parseTimetable(raw).map(r => Object.assign({ on: true }, r));
  if (!rows.length) {
    stepSource("I couldn't find any classes in that. Check the text below (fix it if the reading was off) and try again, or add them by hand.", raw || "");
    return;
  }
  review();
}

function review() {
  const subjects = store.data.subjects;
  const names = subjects.filter(s => !s.archived).map(s => '<option value="' + esc(s.name) + '">').join("");
  const html =
    '<p class="muted" style="margin-top:0">Found <b>' + rows.length + "</b> class" + (rows.length === 1 ? "" : "es") + ". Fix anything that looks off — highlighted rows are ones I’m less sure about.</p>" +
    '<datalist id="imp-subs">' + names + "</datalist>" +
    '<div class="imp-rows">' + rows.map((r, i) => rowHtml(r, i, subjects)).join("") + "</div>" +
    '<div class="row" style="margin-top:12px"><button type="button" class="btn sm" id="imp-add">+ Add a row</button><button type="button" class="btn sm ghost" id="imp-raw">Show what was read</button></div>' +
    '<div class="dlg-foot"><label class="row left" style="gap:8px;font-size:13px;margin-right:auto"><input type="checkbox" id="imp-replace"' + (replaceAll_ ? " checked" : "") + '><span>Replace my current timetable</span></label>' +
    '<button type="button" class="btn sm ghost" data-close>Cancel</button><button type="button" class="btn sm solid" id="imp-go"></button></div>';
  const dlg = shell(html);
  const go = dlg.querySelector("#imp-go");
  const count = () => { const n = rows.filter(r => r.on).length; go.textContent = "Import " + n + " class" + (n === 1 ? "" : "es"); go.disabled = !n; };
  count();
  const rowsEl = dlg.querySelector(".imp-rows");
  rowsEl.addEventListener("input", onEdit); rowsEl.addEventListener("change", onEdit);
  function onEdit(e) {
    const el = e.target, row = el.closest(".imp-row");
    if (!row || !el.dataset.k) return;
    const r = rows[Number(row.dataset.i)];
    r[el.dataset.k] = el.type === "checkbox" ? el.checked : el.dataset.k === "day" ? Number(el.value) : el.value;
    const hint = row.querySelector(".imp-hint"); if (hint) hint.innerHTML = hintHtml(r, subjects);
    row.classList.toggle("off", !r.on);
    count();
  }
  rowsEl.addEventListener("click", e => {
    const d = e.target.closest("[data-del]");
    if (d) { rows.splice(Number(d.closest(".imp-row").dataset.i), 1); review(); }
  });
  dlg.querySelector("#imp-add").onclick = () => { rows.push({ on: true, day: 0, start: "09:00", end: "10:00", subject: "", code: "", room: "", kind: "Lecture", check: true }); review(); };
  dlg.querySelector("#imp-raw").onclick = () => stepSource(null, raw);
  dlg.querySelector("#imp-replace").onchange = e => { replaceAll_ = e.target.checked; };
  go.onclick = () => { commit(); dlg.close(); };
}

const hintHtml = (r, subjects) => {
  if (!String(r.subject).trim()) return '<span class="bad">Needs a subject name</span>';
  const m = matchSubject(r, subjects);
  return m ? "→ matches <b>" + esc(m.name) + "</b>" : "→ new subject";
};

function rowHtml(r, i, subjects) {
  const opt = (arr, v, fn) => arr.map((x, j) => '<option value="' + (fn ? fn(x, j) : x) + '"' + ((fn ? fn(x, j) : x) == v ? " selected" : "") + ">" + (fn ? x : x) + "</option>").join("");
  return '<div class="imp-row' + (r.check ? " check" : "") + (r.on ? "" : " off") + '" data-i="' + i + '">' +
    '<label class="imp-on"><input type="checkbox" data-k="on"' + (r.on ? " checked" : "") + ' aria-label="Include"></label>' +
    '<input class="imp-sub" data-k="subject" list="imp-subs" value="' + esc(r.subject) + '" placeholder="Subject" maxlength="120">' +
    '<select class="imp-day" data-k="day" aria-label="Day">' + DAYS_LONG.map((d, j) => '<option value="' + j + '"' + (j === r.day ? " selected" : "") + ">" + d.slice(0, 3) + "</option>").join("") + "</select>" +
    '<input class="imp-st" data-k="start" type="time" value="' + esc(r.start) + '" aria-label="Starts">' +
    '<input class="imp-en" data-k="end" type="time" value="' + esc(r.end) + '" aria-label="Ends">' +
    '<input class="imp-room" data-k="room" value="' + esc(r.room) + '" placeholder="Room" maxlength="60">' +
    '<select class="imp-kind" data-k="kind" aria-label="Type">' + KINDS.map(k => '<option' + (k === r.kind ? " selected" : "") + ">" + k + "</option>").join("") + "</select>" +
    '<button type="button" class="btn xs ghost imp-del" data-del aria-label="Remove row">✕</button>' +
    '<div class="imp-hint mono muted">' + hintHtml(r, subjects) + "</div></div>";
}

function commit() {
  const picked = rows.filter(r => r.on && String(r.subject).trim() && r.start);
  if (!picked.length) return;
  let made = 0, created = 0;
  update(d => {
    if (replaceAll_) d.timetable = [];
    const byName = new Map();
    picked.forEach(r => {
      let s = matchSubject(r, d.subjects) || byName.get(norm(r.subject));
      if (!s) {
        s = { id: uid(), name: r.subject.trim(), code: r.code || "", faculty: "", color: PALETTE[d.subjects.length % PALETTE.length], target: null, credits: "", archived: false };
        d.subjects.push(s); created++;
      }
      byName.set(norm(r.subject), s);
      const clash = d.timetable.some(t => t.subjectId === s.id && t.day === r.day && t.start === r.start);
      if (!clash) { d.timetable.push({ id: uid(), subjectId: s.id, day: r.day, start: r.start, end: r.end || "", room: r.room || "", kind: r.kind || "Lecture" }); made++; }
    });
  });
  replaceAll_ = false;
  toast("Imported " + made + " class" + (made === 1 ? "" : "es") + (created ? " · " + created + " new subject" + (created === 1 ? "" : "s") : ""));
  if (location.hash !== "#/timetable") location.hash = "#/timetable";
}
