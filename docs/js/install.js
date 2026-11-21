// "Install as an app" — Chromium install prompt, or Add-to-Home-Screen instructions on iPhone/iPad.
import { esc } from "./ui.js";

let deferred = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event("campusos:installable")); });
window.addEventListener("appinstalled", () => { deferred = null; window.dispatchEvent(new Event("campusos:installable")); });

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());

export async function installFlow() {
  if (deferred) {
    deferred.prompt();
    try { await deferred.userChoice; } catch (_) { /* ignore */ }
    deferred = null;
    window.dispatchEvent(new Event("campusos:installable"));
    return;
  }
  const dlg = document.getElementById("dlg");
  dlg.innerHTML = '<form method="dialog"><div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">Install</p><h2 class="h-md">Add Campus OS to your Home Screen</h2></div>' +
    '<button type="button" class="btn sm icon ghost" data-close aria-label="Close">✕</button></div>' +
    '<ol class="steps">' +
      '<li>Tap the <b>Share</b> button <span class="mono">⬆︎</span> in Safari’s toolbar.</li>' +
      '<li>Scroll and tap <b>Add to Home Screen</b>.</li>' +
      '<li>Tap <b>Add</b>. Campus OS now opens like a real app — full screen, works offline, and can send reminders.</li>' +
    "</ol>" +
    '<p class="muted" style="font-size:13px;margin-top:14px">' + esc(isIOS() ? "On iPhone this only works from Safari." : "In Chrome or Edge, use the install icon in the address bar or the browser menu → Install app.") + "</p>" +
    '<div class="dlg-foot"><button type="button" class="btn sm solid" data-close>Got it</button></div></form>';
  dlg.querySelectorAll("[data-close]").forEach(b => (b.onclick = () => dlg.close()));
  dlg.showModal();
}
