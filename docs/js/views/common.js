import { esc, maskLines } from "../ui.js";

export function pageHead(index, title, actions, sub) {
  return '<header class="page-head">' +
    '<div class="eyebrow mono"><span>' + esc(index) + "</span><span>/</span><span>" + esc(sub || title) + "</span></div>" +
    '<h1 class="display h-lg">' + maskLines([esc(title)]) + "</h1>" +
    '<div class="actions fade-up" style="--d:.25s">' + (actions || "") + "</div></header>";
}

export function emptyState(title, text, btn) {
  return '<div class="empty"><p class="h-sm">' + esc(title) + '</p><p style="margin:0">' + esc(text) + "</p>" + (btn || "") + "</div>";
}

/** Trigger mask/fade-in animations on freshly rendered content. */
export function reveal(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
}
