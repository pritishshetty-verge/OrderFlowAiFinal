import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
export type Accent = "indigo" | "violet" | "blue" | "emerald" | "rose" | "amber" | "pearl";

/** Selectable brand accents. `swatch` is the light-mode hex, used only
 *  for the picker preview — the live value comes from CSS (data-accent). */
/** Accent presets — each is a paired gradient (start + end). The swatch
 *  used in the picker is the same 135° gradient applied across the app
 *  via --brand-gradient. Solid hex is kept for places that absolutely
 *  need a single color (chart series colors, etc.). */
/** Accent presets — each is a paired SOFT gradient (lighter than the
 *  primary brand color so hero cards feel airy, not heavy). The swatches
 *  shown in the picker render the actual gradient applied across the app
 *  via --brand-gradient. Pearl is the monochrome / minimalist option —
 *  it auto-switches the gradient to white→silver and the foreground to
 *  dark, perfect for a premium "no color" look. */
export const ACCENTS: { value: Accent; label: string; swatch: string; gradient: string }[] = [
  { value: "indigo",  label: "Indigo",  swatch: "#818cf8", gradient: "linear-gradient(135deg, #a5b4fc, #c4b5fd)" },
  { value: "violet",  label: "Violet",  swatch: "#a78bfa", gradient: "linear-gradient(135deg, #c4b5fd, #f0abfc)" },
  { value: "blue",    label: "Blue",    swatch: "#60a5fa", gradient: "linear-gradient(135deg, #93c5fd, #7dd3fc)" },
  { value: "emerald", label: "Emerald", swatch: "#34d399", gradient: "linear-gradient(135deg, #6ee7b7, #5eead4)" },
  { value: "rose",    label: "Rose",    swatch: "#fb7185", gradient: "linear-gradient(135deg, #fda4af, #fdba74)" },
  { value: "amber",   label: "Amber",   swatch: "#fbbf24", gradient: "linear-gradient(135deg, #fcd34d, #fdba74)" },
  { value: "pearl",   label: "Pearl",   swatch: "#e4e4e7", gradient: "linear-gradient(135deg, #ffffff, #e4e4e7)" },
];

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultAccent?: Accent;
  storageKey?: string;
  accentStorageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
};

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
  accent: "indigo",
  setAccent: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  defaultAccent = "indigo",
  storageKey = "vite-ui-theme",
  accentStorageKey = "vite-ui-accent",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const [accent, setAccentState] = useState<Accent>(
    () => (localStorage.getItem(accentStorageKey) as Accent) || defaultAccent
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    window.document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  const value = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
    },
    accent,
    setAccent: (next: Accent) => {
      localStorage.setItem(accentStorageKey, next);
      setAccentState(next);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
