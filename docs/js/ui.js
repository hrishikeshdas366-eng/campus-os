// Shared UI helpers
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const PALETTE = ["#f4f4f0", "#9ee6b4", "#8ab4ff", "#ff8a80", "#f3c86a", "#c6a4ff", "#7fd7e1", "#ffa8d2", "#b8b8b2"];

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function iso(d) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export function today() { return iso(new Date()); }
export function parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function weekday(s) { return (parse(s).getDay() + 6) % 7; } // Mon = 0
export function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function fmtDate(s, opts) {
  if (!s) return "";
  const d = parse(s);
  const o = opts || {};
  return (o.weekday === false ? "" : DAYS[weekday(s)] + ", ") + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) +
    (o.year || d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}
export function relDay(s) {
  const n = daysBetween(today(), s);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return "In " + n + " days";
  if (n < -1 && n > -7) return -n + " days ago";
  return fmtDate(s);
}
export function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
export function toMin(t) { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; }
export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return ((h % 12) || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
}
export function pct(n) { return n == null ? "—" : (Math.round(n * 10) / 10).toString(); }
export function plural(n, w, ws) { return n + " " + (n === 1 ? w : (ws || w + "s")); }
export function money(n, cur) {
  const v = Math.round(Number(n) * 100) / 100;
  return (cur || "₹") + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Wrap each line of text in a masked span for the reveal animation. */
export function maskLines(lines) {
  return lines.map(l => '<span class="mask"><span>' + l + "</span></span>").join("");
}

// ---------- toast ----------
let toastTimer;
export function toast(msg, opts) {
  opts = opts || {};
  const el = $("#toast");
  el.className = "toast show" + (opts.error ? " error" : "") + (opts.action ? " has-action" : "");
  el.innerHTML = "<span>" + esc(msg) + "</span>";
  if (opts.action) {
    const b = document.createElement("button");
    b.textContent = opts.action.label;
    b.onclick = () => { el.classList.remove("show"); opts.action.run(); };
    el.appendChild(b);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), opts.action ? 6500 : 3000);
}

// ---------- form dialog ----------
/**
 * openForm({ title, eyebrow, fields:[{name,label,type,value,options,required,full,min,max,step,placeholder}],
 *            submitLabel, onSubmit(values) -> false to keep open, onDelete })
 */
export function openForm(cfg) {
  const dlg = $("#dlg");
  const fieldHtml = cfg.fields.map(f => {
    const id = "f-" + f.name;
    const req = f.required ? " required" : "";
    const val = f.value == null ? "" : f.value;
    const attrs = ["min", "max", "step", "placeholder", "maxlength"].filter(k => f[k] != null)
      .map(k => " " + k + '="' + esc(f[k]) + '"').join("");
    let input;
    if (f.type === "select") {
      input = '<select id="' + id + '" name="' + f.name + '"' + req + ">" + f.options.map(o =>
        '<option value="' + esc(o.value) + '"' + (String(o.value) === String(val) ? " selected" : "") + ">" + esc(o.label) + "</option>").join("") + "</select>";
    } else if (f.type === "textarea") {
      input = '<textarea id="' + id + '" name="' + f.name + '"' + req + attrs + ' rows="' + (f.rows || 6) + '">' + esc(val) + "</textarea>";
    } else if (f.type === "checkbox") {
      return '<label class="field ' + (f.full ? "full" : "") + '" style="flex-direction:row;align-items:center;gap:10px">' +
        '<input type="checkbox" name="' + f.name + '"' + (val ? " checked" : "") + "><span>" + esc(f.label) + "</span></label>";
    } else if (f.type === "html") {
      return '<div class="' + (f.full ? "full" : "") + '">' + f.html + "</div>";
    } else {
      input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || "text") + '" value="' + esc(val) + '"' + req + attrs + ">";
    }
    return '<label class="field ' + (f.full ? "full" : "") + '" for="' + id + '"><span>' + esc(f.label) + (f.required ? " *" : "") + "</span>" + input + "</label>";
  }).join("");

  dlg.innerHTML = '<form method="dialog" novalidate>' +
    '<div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">' + esc(cfg.eyebrow || "Campus OS") + "</p>" +
    '<h2 class="h-md">' + esc(cfg.title) + "</h2></div>" +
    '<button type="button" class="btn sm icon ghost" data-close aria-label="Close">✕</button></div>' +
    '<div class="form-grid">' + fieldHtml + "</div>" +
    '<div class="dlg-foot">' + (cfg.onDelete ? '<button type="button" class="btn sm danger left" data-delete>Delete</button>' : "") +
    '<button type="button" class="btn sm ghost" data-close>Cancel</button>' +
    '<button type="submit" class="btn sm solid">' + esc(cfg.submitLabel || "Save") + "</button></div></form>";

  const form = $("form", dlg);
  $$("[data-close]", dlg).forEach(b => (b.onclick = () => dlg.close()));
  if (cfg.onDelete) $("[data-delete]", dlg).onclick = () => { dlg.close(); cfg.onDelete(); };
  if (cfg.onMount) cfg.onMount(form);
  form.onsubmit = e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const values = {};
    cfg.fields.forEach(f => {
      if (f.type === "html") return;
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === "checkbox") values[f.name] = el.checked;
      else if (f.type === "number") values[f.name] = el.value === "" ? null : Number(el.value);
      else values[f.name] = el.value.trim();
    });
    if (cfg.onSubmit(values, form) !== false) dlg.close();
  };
  dlg.showModal();
  const first = $("input:not([type=checkbox]):not([type=color]), textarea, select", dlg);
  if (first && !("ontouchstart" in window)) first.focus();
  return dlg;
}

export function subjectOptions(subjects, withNone, noneLabel) {
  const opts = subjects.filter(s => !s.archived).map(s => ({ value: s.id, label: s.name + (s.code ? " · " + s.code : "") }));
  return withNone ? [{ value: "", label: noneLabel || "— None —" }].concat(opts) : opts;
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type: type || "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
