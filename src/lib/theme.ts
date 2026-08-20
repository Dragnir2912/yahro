export type YahroTheme = "light" | "dark";

export function initialTheme(): YahroTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("yahro-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: YahroTheme, persist = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080a07" : "#f7f7f4");
  if (persist) window.localStorage.setItem("yahro-theme", theme);
}

export function subscribeToSystemTheme(onChange: (theme: YahroTheme) => void) {
  if (typeof window === "undefined" || window.localStorage.getItem("yahro-theme")) return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
