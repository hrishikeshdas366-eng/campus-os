// Ask Campus AI — questions about your own week, answered by Gemini from an anonymous snapshot.
import { esc, plural } from "../ui.js";
import { pageHead } from "./common.js";
import { fmt } from "../aiui.js";
import * as sync from "../sync.js";

let thread = [];   // in-memory only — never saved

const CHIPS = ["Can I skip any classes tomorrow?", "What should I focus on this week?", "How do I get my lowest attendance back to target?", "Plan my evening around my deadlines"];

export function render(root, d) {
  root.innerHTML = '<div class="page">' + pageHead("10", "Ask AI", "", "Campus AI ✦") +
    '<p class="muted fade-up" style="--d:.2s;max-width:62ch;margin:0 0 22px">Ask about your attendance, classes, deadlines and exams. Campus AI answers from a <b>private snapshot of your week</b> — no name, college, notes or spending are ever sent. Powered by Google Gemini; answers can be wrong.</p>' +
    '<div class="ai-chat" id="ai-thread">' + thread.map(bubble).join("") + "</div>" +
    (thread.length ? "" : '<div class="ai-chips" id="ai-chips">' + CHIPS.map(c => '<button class="btn sm" data-chip="' + esc(c) + '">' + esc(c) + "</button>").join("") + "</div>") +
    '<form class="ai-ask" id="ai-form"><textarea id="ai-q" rows="1" placeholder="Ask anything about your week…" maxlength="500"></textarea><button class="btn solid" id="ai-send" type="submit">Ask ✦</button></form>' +
    '<details class="ai-details"><summary class="mono">What gets sent?</summary><p class="muted" style="font-size:13px;margin:10px 0">Only this — built on your device each time you ask, and sent together with your question:</p><pre id="ai-ctx" class="ai-pre"></pre></details>' +
    (thread.length ? '<p style="margin-top:18px"><button class="btn xs ghost" id="ai-clear">Clear conversation</button></p>' : "") + "</div>";

  const th = root.querySelector("#ai-thread"), q = root.querySelector("#ai-q"), send = root.querySelector("#ai-send");
  root.querySelector(".ai-details").addEventListener("toggle", async e => {
    if (!e.target.open) return;
    const ai = await import("../ai.js");
    root.querySelector("#ai-ctx").textContent = JSON.stringify(ai.buildContext(d), null, 1);
  });
  q.addEventListener("input", () => { q.style.height = "auto"; q.style.height = Math.min(160, q.scrollHeight) + "px"; });
  q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("#ai-form").requestSubmit(); } });
  root.querySelector("#ai-clear")?.addEventListener("click", () => { thread = []; render(root, d); });
  root.addEventListener("click", e => { const c = e.target.closest("[data-chip]"); if (c) { q.value = c.dataset.chip; root.querySelector("#ai-form").requestSubmit(); } });

  root.querySelector("#ai-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = q.value.trim();
    if (!text || send.disabled) return;
    const ai = await import("../ai.js");
    if (!(await ai.ensureReady())) return;
    root.querySelector("#ai-chips")?.remove();
    const item = { q: text, a: null }; thread.push(item);
    th.insertAdjacentHTML("beforeend", bubble(item));
    q.value = ""; q.style.height = "auto"; send.disabled = true;
    const last = th.lastElementChild; last.scrollIntoView({ block: "center", behavior: "smooth" });
    try { item.a = await ai.ask(text, d); }
    catch (err) { item.a = null; item.err = err.message; }
    last.outerHTML = bubble(item);
    send.disabled = false;
    th.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  if (!sync.S.user && !thread.length) root.querySelector(".ai-ask").insertAdjacentHTML("beforebegin", '<p class="mono faint" style="margin:0 0 10px">You\'ll be asked to sign in with Google the first time — it keeps the AI from being abused.</p>');
}

function bubble(t) {
  return '<div class="ai-turn"><div class="ai-q">' + esc(t.q) + '</div><div class="ai-a">' +
    (t.a ? fmt(t.a) : t.err ? '<p class="bad">' + esc(t.err) + "</p>" : '<p class="ai-busy mono"><i></i>Thinking…</p>') + "</div></div>";
}
