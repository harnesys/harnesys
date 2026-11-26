import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { LspBridgeStatus, LspGap } from '@/features/lsp-bridge';
import { monacoLanguageId } from '@/shared/lib/monaco';
import { MonacoBoundary } from '@/shared/ui/monaco-boundary';
import type { MarkdownEditorMode } from '../model/use-markdown-editor-mode';
import { type EditorCursor, EditorStatusBar } from './editor-status-bar';
import { MarkdownFilePreview } from './markdown-file-preview';

type Monaco = Parameters<OnMount>[1];
interface TextEditorViewProps {
  projectId: string;
  path: string;
  modelPath: string;
  value: string;
  language: string;
  detectedLanguage: string;
  languageOverride: string | null;
  theme: string;
  options: editor.IStandaloneEditorConstructionOptions;
  markdownMode: MarkdownEditorMode;
  showMarkdownMode: boolean;
  dirty: boolean;
  cursor: EditorCursor;
  lspStatus: LspBridgeStatus;
  lspPulse: number;
  lspGap: LspGap | null;
  lspInstalling: boolean;
  beforeMount: (monaco: Monaco) => void;
  onMount: OnMount;
  onChange: (text: string) => void;
  onSelectLanguage: (language: string | null) => void;
  onSelectMarkdownMode: (mode: MarkdownEditorMode) => void;
  onRestartFileServer: () => void;
  onInstallFileServer: () => void;
}
export function TextEditorView({
  projectId,
  path,
  modelPath,
  value,
  language,
  detectedLanguage,
  languageOverride,
  theme,
  options,
  markdownMode,
  showMarkdownMode,
  dirty,
  cursor,
  lspStatus,
  lspPulse,
  lspGap,
  lspInstalling,
  beforeMount,
  onMount,
  onChange,
  onSelectLanguage,
  onSelectMarkdownMode,
  onRestartFileServer,
  onInstallFileServer,
}: TextEditorViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="text-editor">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {markdownMode === 'view' ? (
          <MarkdownFilePreview text={value} />
        ) : (
          <MonacoBoundary>
            <Editor
              height="100%"
              path={modelPath}
              language={monacoLanguageId(language)}
              theme={theme}
              value={value}
              loading={null}
              beforeMount={beforeMount}
              onMount={onMount}
              onChange={(next) => onChange(next ?? '')}
              options={options}
            />
          </MonacoBoundary>
        )}
      </div>
      <EditorStatusBar
        projectId={projectId}
        path={path}
        detectedLanguage={detectedLanguage}
        languageOverride={languageOverride}
        languageId={language}
        lspStatus={lspStatus}
        lspPulse={lspPulse}
        lspGap={lspGap}
        lspInstalling={lspInstalling}
        dirty={dirty}
        cursor={cursor}
        content={value}
        onSelectLanguage={onSelectLanguage}
        markdownMode={showMarkdownMode ? markdownMode : undefined}
        onSelectMarkdownMode={showMarkdownMode ? onSelectMarkdownMode : undefined}
        onRestartFileServer={onRestartFileServer}
        onInstallFileServer={onInstallFileServer}
      />
    </div>
  );
}
