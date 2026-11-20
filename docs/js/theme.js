// Theme helper
export function applyTheme(t) {
  if (t === "system") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === "light" ? "#f2f2ee" : "#0b0b0b";
}
