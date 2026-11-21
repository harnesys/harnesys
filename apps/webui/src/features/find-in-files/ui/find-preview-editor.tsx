import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { ContentSearchFile, ContentSearchMatch } from '@/shared/api/content-search';
import { useEditorPreferences } from '@/shared/lib/editor-preferences';
import { detectLanguage } from '@/shared/lib/tool-code';
import { MonacoBoundary } from '@/shared/ui/monaco-boundary';
import { useTheme } from '@/shared/ui/theme-provider';
import { createEditorOptions, editorThemeName } from '@/widgets/file-pane/model/editor-setup';
import { defineAppThemes } from '@/widgets/file-pane/ui/monaco-themes';

type Monaco = Parameters<OnMount>[1];
type Decorations = editor.IEditorDecorationsCollection;

interface FindPreviewEditorProps {
  file: ContentSearchFile;
  match: ContentSearchMatch;
  content: string;
}

export function FindPreviewEditor({ file, match, content }: FindPreviewEditorProps) {
  const { theme } = useTheme();
  const prefs = useEditorPreferences();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<Decorations | null>(null);
  const handleBeforeMount = (monaco: Monaco) => {
    defineAppThemes(monaco);
  };
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection([]);
    highlightMatches(editor, monaco, decorationsRef.current, file, match);
    editor.setPosition({ lineNumber: match.line, column: match.column });
    editor.revealLineInCenterIfOutsideViewport(match.line);
  };
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const collection = decorationsRef.current;
    if (!editor || !monaco || !collection || content.length === 0) {
      return;
    }
    highlightMatches(editor, monaco, collection, file, match);
  }, [content, file, match]);
  const language = detectLanguage(file.path) ?? 'plaintext';
  return (
    <MonacoBoundary>
      <Editor
        key={`${file.sourceId}:${file.path}`}
        height="100%"
        language={language}
        theme={editorThemeName(theme)}
        value={content}
        loading={null}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          ...createEditorOptions(prefs),
          readOnly: true,
          domReadOnly: true,
          folding: false,
          glyphMargin: false,
          minimap: { enabled: false },
          stickyScroll: { enabled: false },
          renderLineHighlight: 'none',
          selectionHighlight: false,
          occurrencesHighlight: 'off',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          contextmenu: false,
          links: false,
          cursorBlinking: 'solid',
          lineDecorationsWidth: 4,
          lineNumbersMinChars: 3,
          padding: { top: 4, bottom: 4 },
        }}
      />
    </MonacoBoundary>
  );
}

function highlightMatches(
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
  collection: Decorations,
  file: ContentSearchFile,
  match: ContentSearchMatch,
) {
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const decorations: editor.IModelDeltaDecoration[] = [];
  for (const item of file.matches) {
    if (item.line > model.getLineCount()) {
      continue;
    }
    const lineText = model.getLineContent(item.line);
    const aligned = item.text === lineText;
    const start = aligned ? item.start : item.column - 1;
    const end = aligned ? item.end : start + (item.end - item.start);
    if (end <= start || start >= lineText.length) {
      continue;
    }
    decorations.push({
      range: new monaco.Range(item.line, start + 1, item.line, Math.min(end, lineText.length) + 1),
      options: { inlineClassName: 'find-preview-match' },
    });
  }
  collection.set(decorations);
  editor.setPosition({ lineNumber: match.line, column: match.column });
  editor.revealLineInCenterIfOutsideViewport(match.line);
}
