import { loader } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';

export type Monaco = typeof monacoNs;

let pending: Promise<Monaco> | null = null;

export function ensureMonaco(): Promise<Monaco> {
  pending ??= bootstrap();
  return pending;
}

async function bootstrap(): Promise<Monaco> {
  const [monaco, editorWorker, cssWorker, htmlWorker, jsonWorker, tsWorker] = await Promise.all([
    import('monaco-editor'),
    import('monaco-editor/editor/editor.worker?worker'),
    import('monaco-editor/language/css/css.worker?worker'),
    import('monaco-editor/language/html/html.worker?worker'),
    import('monaco-editor/language/json/json.worker?worker'),
    import('monaco-editor/language/typescript/ts.worker?worker'),
  ]);
  self.MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'json') {
        return new jsonWorker.default();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker.default();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker.default();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker.default();
      }
      return new editorWorker.default();
    },
  };
  loader.config({ monaco });
  return monaco;
}
