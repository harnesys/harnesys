import type { editor } from 'monaco-editor';
import type { EditorPreferences } from '@/shared/lib/editor-preferences';
export function createEditorOptions(
  prefs: EditorPreferences,
): editor.IStandaloneEditorConstructionOptions {
  return {
    fontSize: prefs.fontSize,
    fontFamily: prefs.fontFamily,
    fontLigatures: prefs.fontLigatures,
    tabSize: prefs.tabSize,
    insertSpaces: prefs.insertSpaces,
    detectIndentation: prefs.detectIndentation,
    wordWrap: prefs.wordWrap ? 'on' : 'off',
    lineNumbers: prefs.lineNumbers ? 'on' : 'off',
    minimap: { enabled: prefs.minimap },
    stickyScroll: { enabled: prefs.stickyScroll },
    renderWhitespace: prefs.renderWhitespace,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 0, bottom: 64 },
    smoothScrolling: true,
    fastScrollSensitivity: 5,
    links: false,
    unicodeHighlight: {
      ambiguousCharacters: false,
    },
    scrollbar: {
      alwaysConsumeMouseWheel: true,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
      useShadows: false,
    },
  };
}
export function editorThemeName(
  theme: 'dark' | 'light' | 'system',
): 'harnesys-dark' | 'harnesys-light' {
  return resolveAppTheme(theme) === 'dark' ? 'harnesys-dark' : 'harnesys-light';
}
function resolveAppTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
export function toModelPath(path: string): string {
  return `file:///${path.replace(/^\/+/, '')}`;
}
