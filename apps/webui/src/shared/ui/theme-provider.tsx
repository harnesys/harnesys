import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  APPEARANCE_STORAGE_KEY,
  type AppearanceSettings,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  type UiAccent,
  type UiScale,
  type UiTheme,
} from '@/shared/lib/appearance';

type ResolvedTheme = 'dark' | 'light';

interface ThemeProviderState {
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
  scale: UiScale;
  setScale: (scale: UiScale) => void;
  accent: UiAccent;
  setAccent: (accent: UiAccent) => void;
}

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return 'dark';
  }
  return 'light';
}

function disableTransitionsTemporarily() {
  const style = document.createElement('style');
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
    ),
  );
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function persist(next: AppearanceSettings) {
  saveAppearance(next);
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_APPEARANCE.theme,
  disableTransitionOnChange = true,
}: {
  children: ReactNode;
  defaultTheme?: UiTheme;
  disableTransitionOnChange?: boolean;
}) {
  const [settings, setSettings] = useState<AppearanceSettings>(() => {
    const loaded = loadAppearance();
    if (loaded.theme === DEFAULT_APPEARANCE.theme && defaultTheme !== DEFAULT_APPEARANCE.theme) {
      const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_APPEARANCE, theme: defaultTheme };
      }
    }
    return loaded;
  });

  const patch = useCallback((partial: Partial<AppearanceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial };
      persist(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: UiTheme) => patch({ theme }), [patch]);
  const setScale = useCallback((scale: UiScale) => patch({ scale }), [patch]);
  const setAccent = useCallback((accent: UiAccent) => patch({ accent }), [patch]);

  const applyTheme = useCallback(
    (nextTheme: UiTheme) => {
      const root = document.documentElement;
      const resolvedTheme = nextTheme === 'system' ? getSystemTheme() : nextTheme;
      const restoreTransitions = disableTransitionOnChange ? disableTransitionsTemporarily() : null;
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
      if (restoreTransitions) {
        restoreTransitions();
      }
    },
    [disableTransitionOnChange],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scale = settings.scale;
    root.dataset.accent = settings.accent;
  }, [settings.scale, settings.accent]);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') {
      return undefined;
    }
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
    const handleChange = () => {
      applyTheme('system');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [settings.theme, applyTheme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() !== 'd') {
        return;
      }
      setSettings((current) => {
        let nextTheme: 'light' | 'dark';
        if (current.theme === 'dark') {
          nextTheme = 'light';
        } else if (current.theme === 'light') {
          nextTheme = 'dark';
        } else if (getSystemTheme() === 'dark') {
          nextTheme = 'light';
        } else {
          nextTheme = 'dark';
        }
        const next = { ...current, theme: nextTheme };
        persist(next);
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== APPEARANCE_STORAGE_KEY) {
        return;
      }
      setSettings(loadAppearance());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      theme: settings.theme,
      setTheme,
      scale: settings.scale,
      setScale,
      accent: settings.accent,
      setAccent,
    }),
    [settings.theme, settings.scale, settings.accent, setTheme, setScale, setAccent],
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
