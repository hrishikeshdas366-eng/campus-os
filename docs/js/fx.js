// Motion & delight: count-up numbers, staggered entrances, scroll reveals, confetti and streak celebrations.
import { streak } from "./insights.js";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let px = innerWidth / 2, py = innerHeight / 2;
document.addEventListener("pointerdown", e => { px = e.clientX; py = e.clientY; }, true);

// ---------- confetti ----------
function colors() {
  const cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue("--ink").trim() || "#f4f4f0";
  return [ink, "#9ee6b4", "#8ab4ff", "#f3c86a", "#ff8a80", "#c6a4ff"];
}
let cv = null, parts = [], raf = 0;
function ensure() {
  if (cv && cv.isConnected) return;
  cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200";
  document.body.appendChild(cv);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cv.getContext("2d").scale(dpr, dpr);
}
function loop() {
  const c = cv.getContext("2d");
  c.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();
  parts = parts.filter(p => now - p.t0 < p.life && p.y < innerHeight + 40);
  parts.forEach(p => {
    p.vy += 0.18 * p.g; p.vx *= 0.985; p.vy *= 0.992;
    p.x += p.vx; p.y += p.vy; p.r += p.vr;
    const k = (now - p.t0) / p.life;
    c.save(); c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c;
    if (p.round) { c.beginPath(); c.arc(0, 0, p.s / 2, 0, 7); c.fill(); } else c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    c.restore();
  });
  if (parts.length) raf = requestAnimationFrame(loop);
  else { cancelAnimationFrame(raf); cv.remove(); cv = null; }
}
/** A burst of confetti from a point (defaults to where you last tapped). */
export function burst(o) {
  if (reduce()) return;
  o = Object.assign({ n: 26, x: px, y: py, power: 1, spread: Math.PI * 2, angle: -Math.PI / 2, g: 1 }, o || {});
  ensure();
  const pal = colors(), t0 = performance.now();
  for (let i = 0; i < o.n; i++) {
    const a = o.angle + (Math.random() - 0.5) * o.spread, v = (3 + Math.random() * 6) * o.power;
    parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: 5 + Math.random() * 6, c: pal[(Math.random() * pal.length) | 0], round: Math.random() < 0.3, life: 1300 + Math.random() * 900, t0 });
  }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
/** Which attendance record was just marked, so its row can flash once. */
export const flash = { id: "" };
export const pop = () => burst({ n: 14, power: 0.7 });
/** Two cannons from the bottom corners. */
export function celebrate() {
  burst({ n: 60, x: 0, y: innerHeight, angle: -Math.PI / 3, spread: 0.9, power: 2.1 });
  burst({ n: 60, x: innerWidth, y: innerHeight, angle: -Math.PI * 2 / 3, spread: 0.9, power: 2.1 });
}

// ---------- streak milestones ----------
const MARKS = [3, 7, 14, 21, 30, 50, 75, 100];
const FX = "campusos:streak-fx";
/** Call after marking a class present. Returns the milestone just reached (and celebrates), else 0. */
export function checkStreak(d) {
  try {
    const cur = streak(d).current;
    const last = Number(localStorage.getItem(FX) || 0);
    if (cur < last) localStorage.setItem(FX, "0");
    const hit = MARKS.filter(m => m <= cur && m > last).pop() || 0;
    if (hit) { localStorage.setItem(FX, String(hit)); setTimeout(celebrate, 150); }
    return hit;
  } catch (_) { return 0; }
}

// ---------- entrances ----------
function countUp(el) {
  const node = el.firstChild;
  if (!node || node.nodeType !== 3) return;
  const m = node.nodeValue.match(/^(\D*?)(\d+(?:\.\d+)?)([\s\S]*)$/);
  if (!m) return;
  const to = parseFloat(m[2]); if (!(to > 0)) return;
  const dec = (m[2].split(".")[1] || "").length, t0 = performance.now(), D = 900;
  (function f(now) {
    const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
    node.nodeValue = m[1] + (to * e).toFixed(dec) + m[3];
    if (p < 1 && el.isConnected) requestAnimationFrame(f); else node.nodeValue = m[1] + m[2] + m[3];
  })(t0);
}

/** Staggered rise-in, scroll-reveal for lower sections and count-up numbers. Runs once per page visit. */
export function polish(root) {
  if (reduce()) return;
  const groups = new Map();
  root.querySelectorAll(".list > *, .grid > .card, .grid > a, .class-row, .wstrip .wd, .wr-teaser").forEach(el => {
    if (el.closest(".mask")) return;
    const k = el.parentElement, n = groups.get(k) || 0; groups.set(k, n + 1);
    el.style.setProperty("--i", Math.min(n, 12));
    el.classList.add("rise");
  });
  root.querySelectorAll(".hero-meta .num, .stat .num, .wkgrid .num, .grid.g3 .num").forEach(countUp);
  let below = [...root.querySelectorAll(".section")].filter(s => s.getBoundingClientRect().top > innerHeight * 0.92);
  if (below.length) {
    below.forEach(s => s.classList.add("sr"));
    // anything at or above the lower edge of the screen is shown — including sections you scrolled straight past
    const check = () => {
      below = below.filter(s => { if (!s.isConnected || s.getBoundingClientRect().top < innerHeight * 0.92) { s.classList.add("sr-in"); return false; } return true; });
      if (!below.length) { removeEventListener("scroll", check); removeEventListener("resize", check); }
    };
    addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    setTimeout(() => { below.forEach(s => s.classList.add("sr-in")); below = []; check(); }, 12000);
  }
}
