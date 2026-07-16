import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components';
import {
  DEFAULT_VARIANT,
  getTheme,
  themes,
  ThemeVariant,
} from './theme';

// Cast: styled-components v4 ships React 16/17-era class-component typings that
// React 18's stricter JSX resolution rejects. Narrow it to an FC so TSC accepts
// it; runtime behavior is unchanged. (Mirrors the cast that lived in App.tsx.)
const ThemeProvider = StyledThemeProvider as unknown as React.FC<
  React.PropsWithChildren<{ theme: object }>
>;

const STORAGE_KEY = 'trinity.themeVariant';

const isVariant = (v: unknown): v is ThemeVariant =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(themes, v);

// Read the persisted choice synchronously so the very first paint is already in
// the right look (no flash of the wrong theme).
const readStoredVariant = (): ThemeVariant => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isVariant(stored)) return stored;
  } catch {
    // localStorage can throw in locked-down contexts — fall back to default.
  }
  return DEFAULT_VARIANT;
};

interface ThemeVariantContextValue {
  variant: ThemeVariant;
  setVariant: (variant: ThemeVariant) => void;
}

const ThemeVariantContext = createContext<ThemeVariantContextValue>({
  variant: DEFAULT_VARIANT,
  setVariant: () => undefined,
});

export const useThemeVariant = (): ThemeVariantContextValue =>
  useContext(ThemeVariantContext);

/**
 * Holds the active aesthetic, persists it, and renders styled-components'
 * ThemeProvider with the matching token set. Wrap the app in this in place of a
 * bare <ThemeProvider theme={theme}>.
 */
export const ThemeVariantProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [variant, setVariantState] = useState<ThemeVariant>(readStoredVariant);

  const setVariant = useCallback((next: ThemeVariant) => {
    setVariantState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice still applies for this session.
    }
  }, []);

  const value = useMemo(() => ({ variant, setVariant }), [variant, setVariant]);
  const activeTheme = useMemo(() => getTheme(variant), [variant]);

  return (
    <ThemeVariantContext.Provider value={value}>
      <ThemeProvider theme={activeTheme}>{children}</ThemeProvider>
    </ThemeVariantContext.Provider>
  );
};
