import { esc, maskLines } from "../ui.js";
import { polish } from "../fx.js";

export function pageHead(index, title, actions, sub) {
  return '<header class="page-head">' +
    '<div class="eyebrow mono"><span>' + esc(index) + "</span><span>/</span><span>" + esc(sub || title) + "</span></div>" +
    '<h1 class="display h-lg">' + maskLines([esc(title)]) + "</h1>" +
    '<div class="actions fade-up" style="--d:.25s">' + (actions || "") + "</div></header>";
}

const ic = d => '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICONS = {
  calendar: ic('<rect x="7" y="10" width="34" height="31" rx="5"/><path d="M7 19h34M16 6v8M32 6v8"/><circle cx="24" cy="29" r="2.4" fill="currentColor"/>'),
  check: ic('<circle cx="24" cy="24" r="17"/><path d="m16 24.5 6 6 11-12"/>'),
  exam: ic('<rect x="10" y="7" width="28" height="35" rx="4"/><path d="M17 17h14M17 24h14M17 31h8"/>'),
  note: ic('<path d="M12 7h19l7 7v27H12z"/><path d="M31 7v8h7M18 24h12M18 31h12"/>'),
  coin: ic('<circle cx="24" cy="24" r="17"/><path d="M29 18.5c-1.2-1.5-3-2.3-5-2.3-3 0-5 1.5-5 3.8s2 3.3 5 4 5 1.700 5 4-2 3.800-5 3.800c-2.200 0-4-.8-5.200-2.400M24 12v4M24 32v4"/>'),
  chart: ic('<path d="M8 38h32M13 38V24M22 38V14M31 38V28M40 38V19"/>'),
  layers: ic('<path d="m24 8 17 9-17 9-17-9z"/><path d="m7 25 17 9 17-9M7 33l17 9 17-9"/>'),
  list: ic('<path d="M17 14h22M17 24h22M17 34h22"/><circle cx="10" cy="14" r="1.6" fill="currentColor"/><circle cx="10" cy="24" r="1.6" fill="currentColor"/><circle cx="10" cy="34" r="1.6" fill="currentColor"/>'),
  spark: ic('<path d="M24 7v9M24 32v9M7 24h9M32 24h9M13 13l6 6M29 29l6 6M35 13l-6 6M19 29l-6 6"/>'),
};
function iconFor(title) {
  const t = String(title).toLowerCase();
  if (/exam/.test(t)) return "exam";
  if (/class|timetable|schedule|nothing here|free/.test(t)) return "calendar";
  if (/task|caught up|completed|due/.test(t)) return "check";
  if (/note|match/.test(t)) return "note";
  if (/logged|expense|budget|money/.test(t)) return "coin";
  if (/semester|grade/.test(t)) return "chart";
  if (/subject/.test(t)) return "layers";
  if (/record|history/.test(t)) return "list";
  return "spark";
}
export function emptyState(title, text, btn, icon) {
  return '<div class="empty"><span class="empty-ic">' + ICONS[icon || iconFor(title)] + '</span><p class="h-sm">' + esc(title) + '</p><p style="margin:0">' + esc(text) + "</p>" + (btn || "") + "</div>";
}

/** Trigger mask/fade-in animations on freshly rendered content. */
export function reveal(root) {
  try { polish(root); } catch (_) { /* motion is optional */ }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
}
