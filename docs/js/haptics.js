// Subtle tap feedback on touch devices.
// Android/Chrome: Vibration API. iOS Safari (17.4+): toggling a native <input switch> gives a light haptic tick.
let sw = null, busy = false;
const KEY = "campusos:haptics";

// Per-device preference (a phone may want it, a laptop doesn't) — so it is kept locally, not in the synced data.
export function hapticsOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch (_) { return true; }
}
export function setHaptics(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) { /* ignore */ }
}
export function hapticsSupported() {
  return matchMedia("(pointer: coarse)").matches;
}

export function haptic(strong) {
  if (busy || !hapticsOn() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try { if (navigator.vibrate && navigator.vibrate(strong ? 18 : 8)) return; } catch (_) { /* fall through */ }
  try {
    busy = true;
    if (!sw) {
      sw = document.createElement("label");
      sw.setAttribute("aria-hidden", "true");
      sw.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      const i = document.createElement("input");
      i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
      sw.appendChild(i);
      document.body.appendChild(sw);
    }
    sw.click();
  } catch (_) { /* unsupported — silently skip */ }
  finally { setTimeout(() => { busy = false; }, 0); }
}

export function initHaptics() {
  if (!matchMedia("(pointer: coarse)").matches) return;
  document.addEventListener("click", e => {
    if (busy) return;
    const t = e.target.closest && e.target.closest("button, .btn, [data-ca], [data-a], input[type=checkbox], input[type=radio], .menu-link, .slot, .cal .d");
    if (!t || t.id === "hap" || t.disabled || t.closest("[aria-hidden=true]")) return;
    haptic(t.matches(".good-b, .bad-b, [data-st]"));
  }, true);
}
