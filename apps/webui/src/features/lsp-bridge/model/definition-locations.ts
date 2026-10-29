import type * as monacoNs from 'monaco-editor';
import { readProjectFileText } from '@/shared/api/files';
import { type MonacoApi, toMonacoLocations } from './lsp-converters';

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  md: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
};

function languageForPath(path: string): string {
  const name = path.includes('/') ? (path.split('/').pop() ?? '') : path;
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '';
  return EXT_LANGUAGE[ext] ?? 'plaintext';
}

function toRelativePath(uri: monacoNs.Uri): string {
  return decodeURIComponent(uri.path).replace(/^\/+/, '');
}

function findExistingModel(monaco: MonacoApi, path: string): monacoNs.editor.ITextModel | null {
  const direct = monaco.editor.getModel(monaco.Uri.parse(`file:///${path}`));
  if (direct) {
    return direct;
  }
  const suffix = `/${path}`;
  return (
    monaco.editor.getModels().find((model) => model.uri.path.endsWith(suffix)) ??
    monaco.editor.getModels().find((model) => model.uri.path === `/${path}`) ??
    null
  );
}

export async function toOpenableLocations(
  raw: unknown,
  monaco: MonacoApi,
  sourceId: string,
): Promise<monacoNs.languages.Location[]> {
  const base = toMonacoLocations(raw, monaco);
  const out: monacoNs.languages.Location[] = [];
  for (const location of base) {
    const path = toRelativePath(location.uri);
    let model = findExistingModel(monaco, path);
    if (!model) {
      try {
        const content = await readProjectFileText(sourceId, path);
        model = monaco.editor.createModel(
          content,
          languageForPath(path),
          monaco.Uri.parse(`file:///${path}`),
        );
      } catch {
        continue;
      }
    }
    out.push({ uri: model.uri, range: location.range });
  }
  return out;
}
