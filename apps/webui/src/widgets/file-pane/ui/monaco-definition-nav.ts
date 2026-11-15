import type * as monacoNs from 'monaco-editor';
import { useIdeStore } from '@/features/ide';
import { openProjectFile } from '@/features/open-file';
import { setPendingReveal } from '../model/definition-reveal';

type Monaco = typeof monacoNs;
export interface DefinitionNavContext {
  projectId: string;
  filePath: string;
}
interface EditorResource {
  scheme: string;
  authority: string;
  path: string;
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
        const reveal =
          'startLineNumber' in selectionOrPosition
            ? {
                lineNumber: selectionOrPosition.startLineNumber,
                column: selectionOrPosition.startColumn,
              }
            : {
                lineNumber: selectionOrPosition.lineNumber,
                column: selectionOrPosition.column,
              };
        setPendingReveal({ path: target, ...reveal });
      }
      openProjectFile(ctx.projectId, target);
      useIdeStore.getState().openFile(ctx.projectId, target);
      return true;
    },
  });
  return () => disposable.dispose();
}
