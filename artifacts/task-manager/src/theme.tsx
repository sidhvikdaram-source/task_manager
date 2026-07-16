import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeId = 'tech-brutalist' | 'clean-matte' | 'midnight-violet' | 'evergreen' | 'paper-blue' | 'soft-sage' | 'rose-quartz';

export const themes: Array<{ id: ThemeId; label: string }> = [
  { id: 'tech-brutalist', label: 'Tech Brutalist' },
  { id: 'clean-matte', label: 'Clean Matte' },
  { id: 'midnight-violet', label: 'Midnight Violet' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'paper-blue', label: 'Paper Blue' },
  { id: 'soft-sage', label: 'Soft Sage' },
  { id: 'rose-quartz', label: 'Rose Quartz' },
];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'velocity-theme';

function readInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(storageKey);
    if (themes.some((theme) => theme.id === stored)) return stored as ThemeId;
  } catch {
    // localStorage can be unavailable in embedded/private contexts.
  }
  return 'tech-brutalist';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', ['tech-brutalist', 'midnight-violet', 'evergreen'].includes(theme));
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Non-persistent theme still works for the current session.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
