// Subtle tap feedback on touch devices.
// Android/Chrome: Vibration API. iOS Safari (17.4+): toggling a native <input switch> gives a light haptic tick.
let sw = null, busy = false;

export function haptic(strong) {
  if (busy || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    if (!t || t.disabled || t.closest("[aria-hidden=true]")) return;
    haptic(t.matches(".good-b, .bad-b, [data-st]"));
  }, true);
}
