import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { DesktopTheme } from "@miquelt9/pc-ui";

export const THEME_STORAGE_KEY = "bingo-musical:pc-theme";

const THEMES: DesktopTheme[] = ["light", "dark", "system"];

export const THEME_LABELS: Record<DesktopTheme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function isDesktopTheme(value: unknown): value is DesktopTheme {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredTheme(): DesktopTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isDesktopTheme(raw)) return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return "system";
}

export function applyDocumentTheme(theme: DesktopTheme) {
  const root = document.documentElement;
  root.dataset.pcTheme = theme;
  root.classList.remove("pc-theme-light", "pc-theme-dark", "pc-theme-system");
  root.classList.add(`pc-theme-${theme}`);
}

interface ThemeContextType {
  theme: DesktopTheme;
  setTheme: (theme: DesktopTheme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<DesktopTheme>(readStoredTheme);

  useLayoutEffect(() => {
    applyDocumentTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* private mode / blocked storage */
    }
  }, [theme]);

  const setTheme = useCallback((next: DesktopTheme) => {
    setThemeState(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme }),
    [theme, setTheme, cycleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
