export type Theme = "light" | "dark";

const THEME_KEY = "ai_plan_architect_theme";

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {
    console.warn("Failed to load theme:", e);
  }
  // Belum pernah memilih: gelap. Aplikasi ini dipakai berjam-jam di samping
  // terminal, dan tampilan gelap itu yang dirancang lebih dulu.
  return "dark";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.warn("Failed to save theme:", e);
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
