export const THEME_STORAGE_KEY = "theme";

export const THEME_BOOT_SCRIPT = `document.documentElement.dataset.theme = localStorage.getItem("${THEME_STORAGE_KEY}") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");`;
