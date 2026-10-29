export const APPEARANCE_STORAGE_KEY = 'harnesys.appearance';

export const UI_SCALES = ['small', 'middle', 'large', 'extra'] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const DEFAULT_UI_SCALE: UiScale = 'middle';
export const UI_SCALE_LABELS: Record<UiScale, string> = {
  small: 'Small',
  middle: 'Middle',
  large: 'Large',
  extra: 'Extra',
};

export const UI_ACCENTS = ['red', 'orange', 'yellow', 'green', 'iris', 'indigo', 'violet'] as const;
export type UiAccent = (typeof UI_ACCENTS)[number];
export const DEFAULT_UI_ACCENT: UiAccent = 'orange';
export const UI_ACCENT_SWATCHES: Record<
  UiAccent,
  {
    label: string;
    swatch: string;
    onSwatch: string;
  }
> = {
  red: { label: 'Red', swatch: '#e5484d', onSwatch: '#fff' },
  orange: { label: 'Orange', swatch: '#c4622d', onSwatch: '#fff' },
  yellow: { label: 'Yellow', swatch: '#e2b00b', onSwatch: '#1a1d22' },
  green: { label: 'Green', swatch: '#2f9e6a', onSwatch: '#fff' },
  iris: { label: 'Iris', swatch: '#5b5bd6', onSwatch: '#fff' },
  indigo: { label: 'Indigo', swatch: '#3e63dd', onSwatch: '#fff' },
  violet: { label: 'Violet', swatch: '#7c3aed', onSwatch: '#fff' },
};

export const UI_THEMES = ['system', 'light', 'dark'] as const;
export type UiTheme = (typeof UI_THEMES)[number];
export const DEFAULT_UI_THEME: UiTheme = 'dark';

export interface AppearanceSettings {
  theme: UiTheme;
  scale: UiScale;
  accent: UiAccent;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: DEFAULT_UI_THEME,
  scale: DEFAULT_UI_SCALE,
  accent: DEFAULT_UI_ACCENT,
};

export function isUiScale(value: string | null | undefined): value is UiScale {
  return value !== null && value !== undefined && (UI_SCALES as readonly string[]).includes(value);
}

export function isUiAccent(value: string | null | undefined): value is UiAccent {
  return value !== null && value !== undefined && (UI_ACCENTS as readonly string[]).includes(value);
}

export function isUiTheme(value: string | null | undefined): value is UiTheme {
  return value !== null && value !== undefined && (UI_THEMES as readonly string[]).includes(value);
}

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_APPEARANCE };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_APPEARANCE };
    }
    const record = parsed as Record<string, unknown>;
    const theme = typeof record.theme === 'string' ? record.theme : null;
    const scale = typeof record.scale === 'string' ? record.scale : null;
    const accent = typeof record.accent === 'string' ? record.accent : null;
    return {
      theme: isUiTheme(theme) ? theme : DEFAULT_UI_THEME,
      scale: isUiScale(scale) ? scale : DEFAULT_UI_SCALE,
      accent: isUiAccent(accent) ? accent : DEFAULT_UI_ACCENT,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
}
