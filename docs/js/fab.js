// Floating Campus button — one tap from anywhere: ask AI, add a task/note, mark today, start focus.
import { store } from "./store.js";
import { esc, today, toast } from "./ui.js";
import { taskForm, noteForm } from "./actions.js";
import { fmt } from "./aiui.js";
import { haptic } from "./haptics.js";
import * as ai from "./ai.js";

const KEY = "campusos:fab";
export const fabOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch (_) { return true; } };
export const setFab = on => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) { /* ignore */ } window.dispatchEvent(new Event("fab-pref")); };

const BY_ROUTE = {
  "": ["What should I focus on today?", "Can I skip any classes tomorrow?"],
  attendance: ["How do I get my lowest attendance back to target?", "Which classes can I safely skip?"],
  timetable: ["What does my week look like?", "Which day is my heaviest?"],
  tasks: ["Plan my evening around my deadlines", "What is most urgent?"],
  exams: ["How should I split my revision time?", "Which exam needs the most prep?"],
  notes: ["Give me study tips for my next exam"],
};
let thread = [];

export function initFab() {
  const root = document.createElement("div");
  root.className = "fab-root";
  root.innerHTML =
    '<div class="fab-panel" id="fab-panel" role="dialog" aria-label="Quick access" hidden>' +
      '<div class="fab-top"><b>Campus AI <span aria-hidden="true">✦</span></b><span class="mono faint">tap anywhere to close</span></div>' +
      '<div class="fab-acts">' +
        '<button class="btn sm" data-fa="task">+ Task</button><button class="btn sm" data-fa="note">+ Note</button>' +
        '<button class="btn sm" data-fa="present">✓ Mark today</button><button class="btn sm" data-fa="focus">◔ Focus</button>' +
      "</div>" +
      '<div class="fab-chat" id="fab-chat"></div>' +
      '<div class="fab-chips" id="fab-chips"></div>' +
      '<form class="fab-ask" id="fab-form"><textarea id="fab-q" rows="1" maxlength="500" placeholder="Ask about your week…"></textarea><button class="btn solid sm" type="submit" id="fab-send">Ask ✦</button></form>' +
      '<a class="mono fab-full" href="#/assistant" data-fa="full">Open full chat →</a>' +
    "</div>" +
    '<button class="fab-btn" id="fab-btn" aria-label="Quick access: ask AI and shortcuts" aria-expanded="false" aria-controls="fab-panel"><span class="fab-spark">✦</span><span class="fab-x">×</span></button>';
  document.body.appendChild(root);

  const btn = root.querySelector("#fab-btn"), panel = root.querySelector("#fab-panel"), chat = root.querySelector("#fab-chat");
  const chips = root.querySelector("#fab-chips"), form = root.querySelector("#fab-form"), q = root.querySelector("#fab-q"), send = root.querySelector("#fab-send");

  const apply = () => { root.hidden = !fabOn(); if (root.hidden) setOpen(false); };
  const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "");
  const setOpen = open => {
    panel.hidden = false;
    document.body.classList.toggle("fab-open", open);
    btn.setAttribute("aria-expanded", String(open));
    if (open) { paint(); haptic(); setTimeout(() => { if (matchMedia("(hover:hover)").matches) q.focus(); }, 180); }
    else setTimeout(() => { if (!document.body.classList.contains("fab-open")) panel.hidden = true; }, 320);
  };
  const aiReady = () => ai.aiAvailable() && ai.aiOn();
  const bubble = t => '<div class="ai-turn"><div class="ai-q">' + esc(t.q) + '</div><div class="ai-a">' +
    (t.a ? fmt(t.a) : t.err ? '<p class="bad">' + esc(t.err) + "</p>" : '<p class="ai-busy mono"><i></i>Thinking…</p>') + "</div></div>";
  function paint() {
    const on = aiReady();
    form.hidden = !on; panel.querySelector(".fab-full").hidden = !on;
    chat.innerHTML = on ? thread.map(bubble).join("") : '<p class="muted" style="margin:0;font-size:13.5px">Campus AI is switched off on this device. Turn it on in Settings → Campus AI.</p>';
    const sug = (BY_ROUTE[route()] || BY_ROUTE[""]).slice(0, 2);
    chips.innerHTML = on && !thread.length ? sug.map(c => '<button class="btn xs" data-chip="' + esc(c) + '">' + esc(c) + "</button>").join("") : "";
    chat.scrollTop = chat.scrollHeight;
  }

  btn.addEventListener("click", () => setOpen(!document.body.classList.contains("fab-open")));
  document.addEventListener("pointerdown", e => { if (document.body.classList.contains("fab-open") && !root.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.body.classList.contains("fab-open")) setOpen(false);
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (!root.hidden && ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !document.querySelector("dialog[open]")))) { e.preventDefault(); setOpen(true); q.focus(); }
  });
  window.addEventListener("hashchange", () => { if (document.body.classList.contains("fab-open")) setOpen(false); });
  window.addEventListener("fab-pref", apply);

  panel.addEventListener("click", async e => {
    const c = e.target.closest("[data-chip]");
    if (c) { q.value = c.dataset.chip; form.requestSubmit(); return; }
    const a = e.target.closest("[data-fa]")?.dataset.fa;
    if (!a) return;
    setOpen(false);
    if (a === "task") taskForm(null);
    else if (a === "note") noteForm(null);
    else if (a === "present") { const m = await import("./views/attendance.js"); m.markRemaining(today(), "present"); }
    else if (a === "focus") location.hash = "#/focus";
  });
  q.addEventListener("input", () => { q.style.height = "auto"; q.style.height = Math.min(110, q.scrollHeight) + "px"; });
  q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const text = q.value.trim();
    if (!text || send.disabled) return;
    if (!(await ai.ensureReady())) return;
    const item = { q: text, a: null }; thread.push(item);
    q.value = ""; q.style.height = "auto"; send.disabled = true; paint();
    try { item.a = await ai.ask(text, store.data); } catch (err) { item.err = err.message; }
    send.disabled = false; paint();
  });
  apply();
  return apply;
}
