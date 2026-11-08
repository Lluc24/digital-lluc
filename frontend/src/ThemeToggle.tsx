"use client";

import { setTheme, type Theme, useTheme } from "./theme";

const ICON_PATHS_BY_THEME: Record<Theme, string[]> = {
  light: [
    "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
    "M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  ],
  dark: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"],
};

export function ThemeToggle() {
  const selectedTheme = useTheme();
  return (
    <fieldset className="flex rounded-full bg-night/10 p-0.5 dark:bg-white/10">
      <legend className="sr-only">Theme</legend>
      {(["light", "dark"] as const).map((theme) => (
        <button
          key={theme}
          type="button"
          aria-label={`${theme} theme`}
          aria-pressed={theme === selectedTheme}
          onClick={() => setTheme(theme)}
          className={`flex size-9 items-center justify-center rounded-full transition-colors sm:size-8 ${theme === selectedTheme ? "bg-night text-white dark:bg-white dark:text-night" : "text-night/60 hover:text-night dark:text-white/60 dark:hover:text-white"}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICON_PATHS_BY_THEME[theme].map((path) => (
              <path key={path} d={path} />
            ))}
          </svg>
        </button>
      ))}
    </fieldset>
  );
}
