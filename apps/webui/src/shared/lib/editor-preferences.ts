import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const EDITOR_PREFERENCES_STORAGE_KEY = 'studio-editor-preferences';

export type RenderWhitespace = 'none' | 'boundary' | 'selection' | 'all';
export const RENDER_WHITESPACE_MODES: readonly RenderWhitespace[] = [
  'none',
  'boundary',
  'selection',
  'all',
];
export const RENDER_WHITESPACE_LABELS: Record<RenderWhitespace, string> = {
  none: 'None',
  boundary: 'Boundary',
  selection: 'Selection',
  all: 'All',
};

export const EDITOR_FONT_SIZES: readonly number[] = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24,
];
export const EDITOR_TAB_SIZES: readonly number[] = [1, 2, 4, 8];
export const DEFAULT_EDITOR_FONT_FAMILY = 'Monaco, IBM Plex Mono, ui-monospace, monospace';

export type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
export const AUTO_SAVE_MODES: readonly AutoSaveMode[] = [
  'off',
  'afterDelay',
  'onFocusChange',
  'onWindowChange',
];
export const AUTO_SAVE_MODE_LABELS: Record<AutoSaveMode, string> = {
  off: 'Off',
  afterDelay: 'After delay',
  onFocusChange: 'On focus change',
  onWindowChange: 'On window change',
};
export const AUTO_SAVE_DELAYS: readonly number[] = [500, 1000, 2000, 5000];

export interface EditorPreferences {
  fontSize: number;
  fontFamily: string;
  fontLigatures: boolean;
  tabSize: number;
  insertSpaces: boolean;
  detectIndentation: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  stickyScroll: boolean;
  renderWhitespace: RenderWhitespace;
  autoSaveMode: AutoSaveMode;
  autoSaveDelayMs: number;
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  fontSize: 13,
  fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  fontLigatures: false,
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: true,
  wordWrap: false,
  lineNumbers: true,
  minimap: false,
  stickyScroll: false,
  renderWhitespace: 'selection',
  autoSaveMode: 'onFocusChange',
  autoSaveDelayMs: 1000,
};

export interface EditorPreferencesStore extends EditorPreferences {
  setPreference: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
  resetEditorPreferences: () => void;
}

export const useEditorPreferences = create<EditorPreferencesStore>()(
  persist(
    (set) => ({
      ...DEFAULT_EDITOR_PREFERENCES,
      setPreference: (key, value) => set({ [key]: value } as Partial<EditorPreferences>),
      resetEditorPreferences: () => set({ ...DEFAULT_EDITOR_PREFERENCES }),
    }),
    {
      name: EDITOR_PREFERENCES_STORAGE_KEY,
      version: 2,
      migrate: (persisted) => {
        const prev = persisted as Record<string, unknown>;
        const legacyAfterDelay = prev.autoSave === true;
        const storedMode = AUTO_SAVE_MODES.find((mode) => mode === prev.autoSaveMode);
        const storedDelay = AUTO_SAVE_DELAYS.find((delay) => delay === prev.autoSaveDelayMs);
        const storedWhitespace = RENDER_WHITESPACE_MODES.find(
          (mode) => mode === prev.renderWhitespace,
        );
        const state = {
          fontSize:
            typeof prev.fontSize === 'number' ? prev.fontSize : DEFAULT_EDITOR_PREFERENCES.fontSize,
          fontFamily:
            typeof prev.fontFamily === 'string' && prev.fontFamily.length > 0
              ? prev.fontFamily
              : DEFAULT_EDITOR_PREFERENCES.fontFamily,
          fontLigatures:
            typeof prev.fontLigatures === 'boolean'
              ? prev.fontLigatures
              : DEFAULT_EDITOR_PREFERENCES.fontLigatures,
          tabSize:
            typeof prev.tabSize === 'number' ? prev.tabSize : DEFAULT_EDITOR_PREFERENCES.tabSize,
          insertSpaces:
            typeof prev.insertSpaces === 'boolean'
              ? prev.insertSpaces
              : DEFAULT_EDITOR_PREFERENCES.insertSpaces,
          detectIndentation:
            typeof prev.detectIndentation === 'boolean'
              ? prev.detectIndentation
              : DEFAULT_EDITOR_PREFERENCES.detectIndentation,
          wordWrap:
            typeof prev.wordWrap === 'boolean'
              ? prev.wordWrap
              : DEFAULT_EDITOR_PREFERENCES.wordWrap,
          lineNumbers:
            typeof prev.lineNumbers === 'boolean'
              ? prev.lineNumbers
              : DEFAULT_EDITOR_PREFERENCES.lineNumbers,
          minimap:
            typeof prev.minimap === 'boolean' ? prev.minimap : DEFAULT_EDITOR_PREFERENCES.minimap,
          stickyScroll:
            typeof prev.stickyScroll === 'boolean'
              ? prev.stickyScroll
              : DEFAULT_EDITOR_PREFERENCES.stickyScroll,
          renderWhitespace: storedWhitespace ?? DEFAULT_EDITOR_PREFERENCES.renderWhitespace,
          autoSaveMode:
            storedMode ??
            (legacyAfterDelay ? 'afterDelay' : DEFAULT_EDITOR_PREFERENCES.autoSaveMode),
          autoSaveDelayMs: storedDelay ?? DEFAULT_EDITOR_PREFERENCES.autoSaveDelayMs,
        };
        return state as EditorPreferences;
      },
    },
  ),
);

export function isDefaultEditorPreferences(values: EditorPreferences): boolean {
  const keys = Object.keys(DEFAULT_EDITOR_PREFERENCES) as readonly (keyof EditorPreferences)[];
  return keys.every((key) => values[key] === DEFAULT_EDITOR_PREFERENCES[key]);
}
