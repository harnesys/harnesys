import type * as monacoNs from 'monaco-editor';
import { openFile } from '@/features/ide';
import { toOpenableLocations } from '@/features/lsp-bridge';
import { setPendingReveal } from '../model/definition-reveal';
import { findHtmlPathMatches, resolveHtmlPathToProjectPath } from './resolve-html-path';

type Monaco = typeof monacoNs;
const HTML_LANGUAGE = 'html';
let htmlProviderRegistered = false;
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
export function setMonacoDefinitionNavContext(ctx: DefinitionNavContext | null) {
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
  ensureMonacoHtmlDefinitionProvider(monaco);
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
      openFile({ source: 'project', projectId: ctx.projectId, path: target });
      return true;
    },
  });
  return () => disposable.dispose();
}
function ensureMonacoHtmlDefinitionProvider(monaco: Monaco): void {
  if (htmlProviderRegistered) {
    return;
  }
  htmlProviderRegistered = true;
  monaco.languages.registerDefinitionProvider(HTML_LANGUAGE, {
    provideDefinition: async (model, position) => {
      const ctx = contextRef.current;
      if (!ctx) {
        return null;
      }
      const hit = findHtmlPathMatches(model.getLineContent(position.lineNumber)).find(
        (item) => position.column >= item.startColumn && position.column < item.endColumn,
      );
      if (!hit) {
        return null;
      }
      const fromFile = model.uri.path.replace(/^\/+/, '');
      const target = await resolveHtmlPathToProjectPath(ctx.projectId, fromFile, hit.raw);
      if (!target) {
        return null;
      }
      const locations = await toOpenableLocations([{ path: target }], monaco, ctx.projectId);
      return locations.length > 0 ? locations : null;
    },
  });
}
