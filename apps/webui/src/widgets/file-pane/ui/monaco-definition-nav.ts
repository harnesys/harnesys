import type { OnMount } from '@monaco-editor/react';
import { useIdeStore } from '@/features/ide';
import { openProjectFile } from '@/features/open-file';
import { setPendingReveal } from '../model/definition-reveal';

type Monaco = Parameters<OnMount>[1];
export interface DefinitionNavContext {
  projectId: string;
  filePath: string;
}
interface EditorResource {
  scheme: string;
  authority: string;
  path: string;
}
interface EditorRange {
  startLineNumber: number;
  startColumn: number;
}
interface EditorPosition {
  lineNumber: number;
  column: number;
}
const contextRef: {
  current: DefinitionNavContext | null;
} = { current: null };
export function setMonacoDefinitionNavContext(ctx: DefinitionNavContext) {
  contextRef.current = ctx;
}
function projectPathFromResource(resource: EditorResource): string | null {
  if (resource.scheme !== 'file' || resource.authority !== '') {
    return null;
  }
  const raw = resource.path.replace(/^\/+/, '');
  if (!raw) {
    return null;
  }
  if (
    raw.startsWith('Users/') ||
    raw.startsWith('home/') ||
    raw.startsWith('private/') ||
    raw.startsWith('Volumes/') ||
    raw.startsWith('tmp/') ||
    raw.startsWith('var/') ||
    raw.startsWith('etc/') ||
    /^[A-Za-z]:[\\/]/.test(raw)
  ) {
    return null;
  }
  return raw;
}
export function bindMonacoDefinitionOpener(monaco: Monaco): () => void {
  const disposable = monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      const ctx = contextRef.current;
      if (!ctx) {
        return false;
      }
      const target = projectPathFromResource(resource);
      if (!target || target === ctx.filePath.replace(/^\/+/, '')) {
        return false;
      }
      if (selectionOrPosition) {
        const range = selectionOrPosition as EditorRange;
        const position = selectionOrPosition as EditorPosition;
        const reveal =
          'startLineNumber' in range
            ? { lineNumber: range.startLineNumber, column: range.startColumn }
            : { lineNumber: position.lineNumber, column: position.column };
        setPendingReveal({ path: target, ...reveal });
      }
      openProjectFile(ctx.projectId, target);
      useIdeStore.getState().openFile(ctx.projectId, target);
      return true;
    },
  });
  return () => disposable.dispose();
}
