import type { OnMount } from '@monaco-editor/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { remappedPathAfterMove, useIdeStore } from '@/features/ide';
import { markProjectFileDirty } from '@/features/open-file';
import { readProjectFileText } from '@/shared/api/files';
import { useEditorPreferences } from '@/shared/lib/editor-preferences';
import '@/shared/lib/monaco';
import { detectLanguage } from '@/shared/lib/tool-code';
import { useTheme } from '@/shared/ui/theme-provider';
import { takePendingReveal } from '../model/definition-reveal';
import {
  editorLanguageKey,
  loadEditorLanguages,
  saveEditorLanguages,
} from '../model/editor-languages';
import { createEditorOptions, editorThemeName, toModelPath } from '../model/editor-setup';
import { useEditorLspBridge } from '../model/use-editor-lsp-bridge';
import { useMarkdownEditorMode } from '../model/use-markdown-editor-mode';
import { contentQueryKey, scopedKey, useTextPersistence } from '../model/use-text-persistence';
import { bindMonacoDefinitionOpener, setMonacoDefinitionNavContext } from './monaco-definition-nav';
import {
  bindMonacoImportLinkOpener,
  ensureMonacoImportLinkProviders,
  setMonacoImportLinkContext,
} from './monaco-import-links';
import { ensureJsxTagSemanticTokens } from './monaco-jsx-tags';
import { defineAppThemes } from './monaco-themes';
import { TextEditorView } from './text-editor-view';

type FileContent = string;

export function TextEditor({
  projectId,
  path,
  dirty,
  worktreeId,
}: {
  projectId: string;
  path: string;
  dirty: boolean;
  worktreeId?: string;
}) {
  const { theme } = useTheme();
  const prefs = useEditorPreferences();
  const autoSaveModeRef = useRef(prefs.autoSaveMode);
  autoSaveModeRef.current = prefs.autoSaveMode;
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [viewPath, setViewPath] = useState<string | null>(null);
  const [langOverrides, setLangOverrides] = useState<Record<string, string>>(() =>
    loadEditorLanguages(),
  );
  const resolved = editorThemeName(theme);
  const scopeKey = scopedKey(path, worktreeId);
  const contentKey = contentQueryKey(projectId, { path, worktreeId });
  const { flushIfDirty, requestSave } = useTextPersistence({
    projectId,
    setDrafts,
    draftsRef,
  });
  const contentQuery = useQuery({
    queryKey: contentKey,
    queryFn: () => readProjectFileText(projectId, path, worktreeId),
  });
  useEffect(() => {
    if (Object.hasOwn(draftsRef.current, scopeKey)) {
      setViewPath(scopeKey);
      return;
    }
    if (contentQuery.data === undefined) {
      return;
    }
    const text = contentQuery.data;
    setDrafts((prev) => (Object.hasOwn(prev, scopeKey) ? prev : { ...prev, [scopeKey]: text }));
    setViewPath(scopeKey);
  }, [scopeKey, contentQuery.data]);
  const prevServerTextRef = useRef<string | null>(null);
  useEffect(() => {
    const data = contentQuery.data;
    if (data === undefined) {
      return;
    }
    const prevServer = prevServerTextRef.current;
    prevServerTextRef.current = data;
    const current = draftsRef.current[scopeKey];
    if (current === undefined || prevServer === null || prevServer === data) {
      return;
    }
    if (current === prevServer) {
      setDrafts((prev) => ({ ...prev, [scopeKey]: data }));
    }
  }, [contentQuery.data, scopeKey]);
  const lastActiveRef = useRef<{ path: string; worktreeId?: string } | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    const prev = lastActiveRef.current;
    lastActiveRef.current = { path, worktreeId };
    const prevScope = prev ? scopedKey(prev.path, prev.worktreeId) : null;
    if (!prev || prevScope === scopeKey) {
      return;
    }
    setCursor({ line: 1, column: 1 });
    if (!prev.worktreeId && !worktreeId && remappedPathAfterMove(projectId, prev.path) === path) {
      setDrafts((prevDrafts) => {
        if (!Object.hasOwn(prevDrafts, prev.path)) {
          return prevDrafts;
        }
        const { [prev.path]: text, ...rest } = prevDrafts;
        if (Object.hasOwn(rest, path)) {
          return rest;
        }
        return { ...rest, [path]: text };
      });
      return;
    }
    if (autoSaveModeRef.current === 'onFocusChange') {
      void flushIfDirty(prev);
    }
  }, [path, scopeKey, projectId, worktreeId, flushIfDirty]);
  const flushRef = useRef(flushIfDirty);
  flushRef.current = flushIfDirty;
  useEffect(() => {
    const flushActive = () => {
      if (autoSaveModeRef.current !== 'onWindowChange') {
        return;
      }
      const active = lastActiveRef.current;
      if (active) {
        void flushRef.current(active);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushActive();
      }
    };
    window.addEventListener('blur', flushActive);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', flushActive);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => {
    return () => {
      const active = lastActiveRef.current;
      if (active) {
        void flushIfDirty(active);
      }
    };
  }, [flushIfDirty]);
  const activePath = viewPath;
  const value = activePath ? (drafts[activePath] ?? '') : '';
  const serverText =
    activePath === scopeKey
      ? (contentQuery.data ?? '')
      : (qc.getQueryData<FileContent>([
          'source-file-content',
          projectId,
          activePath ?? '',
          worktreeId ?? '',
        ]) ?? '');
  useEffect(() => {
    if (prefs.autoSaveMode !== 'afterDelay' || !activePath || value === serverText) {
      return;
    }
    const timer = setTimeout(() => {
      void flushRef.current({ path, worktreeId });
    }, prefs.autoSaveDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [prefs.autoSaveMode, prefs.autoSaveDelayMs, activePath, value, serverText, path, worktreeId]);
  const save = useCallback(() => {
    if (!activePath || activePath !== scopeKey) {
      return;
    }
    requestSave({ path, worktreeId, draft: drafts[scopeKey], dirty });
  }, [activePath, scopeKey, path, worktreeId, drafts, dirty, requestSave]);
  const selectLanguage = useCallback(
    (targetPath: string, language: string | null) => {
      const key = editorLanguageKey(projectId, targetPath);
      const next = { ...langOverrides };
      if (language === null) {
        delete next[key];
      } else {
        next[key] = language;
      }
      setLangOverrides(next);
      saveEditorLanguages(next);
    },
    [projectId, langOverrides],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);
  const importLinksDisposeRef = useRef<(() => void) | null>(null);
  const editorSubsDisposeRef = useRef<(() => void) | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const detectedLanguage = activePath ? (detectLanguage(activePath) ?? 'plaintext') : 'plaintext';
  const languageOverride = activePath
    ? (langOverrides[editorLanguageKey(projectId, activePath)] ?? null)
    : null;
  const language = languageOverride ?? detectedLanguage;
  const { showMarkdownMode, markdownMode, selectMarkdownMode } = useMarkdownEditorMode(activePath);
  const {
    status: lspStatus,
    pulse: lspPulse,
    restartFileServer,
  } = useEditorLspBridge(projectId, worktreeId ? null : activePath, language);
  useLayoutEffect(() => {
    setMonacoImportLinkContext({
      projectId,
      filePath: viewPath ?? path,
    });
    setMonacoDefinitionNavContext({
      projectId,
      filePath: viewPath ?? path,
    });
  }, [projectId, viewPath, path]);
  useEffect(() => {
    if (!activePath) {
      return;
    }
    const reveal = takePendingReveal(activePath);
    const editor = editorRef.current;
    if (!reveal || !editor) {
      return;
    }
    const position = { lineNumber: reveal.lineNumber, column: reveal.column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
  }, [activePath]);
  useEffect(() => {
    return () => {
      editorSubsDisposeRef.current?.();
      editorSubsDisposeRef.current = null;
      editorRef.current = null;
      importLinksDisposeRef.current?.();
      importLinksDisposeRef.current = null;
    };
  }, []);
  const handleBeforeMount = (monaco: Parameters<OnMount>[1]) => {
    defineAppThemes(monaco);
    ensureJsxTagSemanticTokens(monaco);
    ensureMonacoImportLinkProviders(monaco);
  };
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    const flushOnEditorBlur = () => {
      if (autoSaveModeRef.current !== 'onFocusChange') {
        return;
      }
      const active = lastActiveRef.current;
      if (active) {
        void flushRef.current(active);
      }
    };
    editorSubsDisposeRef.current?.();
    const blurText = editor.onDidBlurEditorText(flushOnEditorBlur);
    const blurWidget = editor.onDidBlurEditorWidget(flushOnEditorBlur);
    const cursorSub = editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });
    editorSubsDisposeRef.current = () => {
      blurText.dispose();
      blurWidget.dispose();
      cursorSub.dispose();
    };
    importLinksDisposeRef.current?.();
    const importLinksDispose = bindMonacoImportLinkOpener(editor, monaco);
    const definitionNavDispose = bindMonacoDefinitionOpener(monaco);
    importLinksDisposeRef.current = () => {
      importLinksDispose();
      definitionNavDispose();
    };
    editor.updateOptions({});
    defineAppThemes(monaco);
    ensureJsxTagSemanticTokens(monaco);
    monaco.editor.setTheme(editorThemeName(theme));
  };
  const options = createEditorOptions(prefs);
  if (!activePath) {
    if (contentQuery.isError) {
      return (
        <div className="flex flex-1 items-center justify-center bg-background px-4 text-muted-foreground text-sm">
          Failed to load file
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <TextEditorView
      projectId={projectId}
      path={activePath}
      value={value}
      language={language}
      detectedLanguage={detectedLanguage}
      languageOverride={languageOverride}
      theme={resolved}
      options={options}
      markdownMode={markdownMode}
      showMarkdownMode={showMarkdownMode}
      dirty={dirty}
      cursor={cursor}
      lspStatus={lspStatus}
      lspPulse={lspPulse}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(text) => {
        draftsRef.current = { ...draftsRef.current, [activePath]: text };
        setDrafts((prev) => ({ ...prev, [activePath]: text }));
        const nextDirty = text !== serverText;
        if (!worktreeId) {
          markProjectFileDirty(projectId, activePath, nextDirty);
        }
        useIdeStore.getState().setFileDirty(projectId, path, nextDirty, worktreeId);
      }}
      onSelectLanguage={(next) => selectLanguage(activePath, next)}
      onSelectMarkdownMode={(mode) => selectMarkdownMode(activePath, mode)}
      onRestartFileServer={restartFileServer}
      toModelPath={toModelPath}
    />
  );
}
