export const THEME_STORAGE_KEY = "theme";

// Runs inline in <head> so data-theme is set before the first paint, from localStorage or the system setting.
export const THEME_BOOT_SCRIPT = `document.documentElement.dataset.theme = localStorage.getItem("${THEME_STORAGE_KEY}") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");`;
