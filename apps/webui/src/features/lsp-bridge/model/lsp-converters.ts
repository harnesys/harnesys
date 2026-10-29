import type * as monacoNs from 'monaco-editor';
export type MonacoApi = typeof monacoNs;
export const LSP_MARKER_OWNER = 'lsp';
const TS_LIKE_LANGUAGES = new Set(['typescript', 'javascript']);
export function supportsBuiltinToggle(languageId: string): boolean {
  return TS_LIKE_LANGUAGES.has(languageId);
}
export function captureBuiltinDiagnostics(
  monaco: MonacoApi,
  languageId: string,
): {
  typescript?: Record<string, unknown>;
  javascript?: Record<string, unknown>;
} | null {
  const ts = monaco.languages.typescript;
  if (!ts || !supportsBuiltinToggle(languageId)) {
    return null;
  }
  return {
    typescript: { ...ts.typescriptDefaults.getDiagnosticsOptions() },
    javascript: { ...ts.javascriptDefaults.getDiagnosticsOptions() },
  };
}
export function applyBuiltinDiagnostics(monaco: MonacoApi, options: Record<string, unknown>): void {
  const ts = monaco.languages.typescript;
  if (!ts) {
    return;
  }
  ts.typescriptDefaults.setDiagnosticsOptions(options as never);
  ts.javascriptDefaults.setDiagnosticsOptions(options as never);
}
export function suspendBuiltinDiagnostics(monaco: MonacoApi, languageId: string): () => void {
  const saved = captureBuiltinDiagnostics(monaco, languageId);
  applyBuiltinDiagnostics(monaco, { noSemanticValidation: true, noSyntaxValidation: false });
  return () => {
    applyBuiltinDiagnostics(
      monaco,
      saved?.typescript ?? { noSemanticValidation: false, noSyntaxValidation: false },
    );
  };
}
export function applyMarkers(
  monaco: MonacoApi,
  model: monacoNs.editor.ITextModel,
  diagnostics: unknown[],
): void {
  const markers = diagnostics
    .map((item) => toMonacoMarker(item))
    .filter((item): item is monacoNs.editor.IMarkerData => item !== undefined);
  monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, markers);
}
function toMonacoMarker(raw: unknown): monacoNs.editor.IMarkerData | undefined {
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const item = raw as {
    range?: {
      start?: {
        line?: unknown;
        character?: unknown;
      };
      end?: {
        line?: unknown;
        character?: unknown;
      };
    };
    line?: unknown;
    character?: unknown;
    endLine?: unknown;
    endCharacter?: unknown;
    severity?: unknown;
    message?: unknown;
    source?: unknown;
    code?: unknown;
  };
  const severityName = item.severity;
  let numericSeverity = 3;
  if (typeof severityName === 'string') {
    numericSeverity = { error: 1, warning: 2, information: 3, hint: 4 }[severityName] ?? 3;
  } else if (typeof severityName === 'number') {
    numericSeverity = severityName;
  }
  const flatStart =
    typeof item.line === 'number' && typeof item.character === 'number'
      ? { line: item.line, character: item.character }
      : undefined;
  const flatEnd =
    typeof item.endLine === 'number' && typeof item.endCharacter === 'number'
      ? { line: item.endLine, character: item.endCharacter }
      : undefined;
  const start = item.range?.start ?? flatStart;
  const end = item.range?.end ?? flatEnd;
  if (
    typeof start?.line !== 'number' ||
    typeof start?.character !== 'number' ||
    typeof end?.line !== 'number' ||
    typeof end?.character !== 'number' ||
    typeof item.message !== 'string'
  ) {
    return undefined;
  }
  const code =
    typeof item.code === 'string' || typeof item.code === 'number' ? ` (${item.code})` : '';
  return {
    severity: markerSeverity(numericSeverity),
    message: `${item.message}${code}`,
    startLineNumber: start.line + 1,
    startColumn: start.character + 1,
    endLineNumber: end.line + 1,
    endColumn: end.character + 1,
    source: typeof item.source === 'string' ? item.source : undefined,
  };
}
function markerSeverity(severity: unknown): monacoNs.MarkerSeverity {
  if (severity === 1) {
    return 8;
  }
  if (severity === 2) {
    return 4;
  }
  if (severity === 3) {
    return 2;
  }
  return 1;
}
export function toLspPosition(position: { lineNumber: number; column: number }): {
  line: number;
  character: number;
} {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}
export function toMonacoRange(range: unknown): monacoNs.IRange {
  const item = range as {
    start?: {
      line?: number;
      character?: number;
    };
    end?: {
      line?: number;
      character?: number;
    };
    line?: number;
    character?: number;
    startLine?: number;
    startCharacter?: number;
    endLine?: number;
    endCharacter?: number;
  };
  const startLine = item?.start?.line ?? item?.startLine ?? item?.line ?? 0;
  const startCharacter = item?.start?.character ?? item?.startCharacter ?? item?.character ?? 0;
  const endLine = item?.end?.line ?? item?.endLine ?? startLine;
  const endCharacter = item?.end?.character ?? item?.endCharacter ?? startCharacter;
  return {
    startLineNumber: startLine + 1,
    startColumn: startCharacter + 1,
    endLineNumber: endLine + 1,
    endColumn: endCharacter + 1,
  };
}
export function toMonacoHover(result: unknown): monacoNs.languages.Hover | null {
  if (result === null || typeof result !== 'object') {
    return null;
  }
  const hover = result as {
    contents?: unknown;
    range?: unknown;
  };
  const contents = hoverContents(hover.contents);
  if (contents.length === 0) {
    return null;
  }
  return {
    contents,
    ...(hover.range ? { range: toMonacoRange(hover.range) } : {}),
  };
}
function hoverContents(raw: unknown): {
  value: string;
}[] {
  const blocks: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === 'string') {
      blocks.push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item !== null && typeof item === 'object') {
      const record = item as {
        kind?: unknown;
        value?: unknown;
        language?: unknown;
      };
      if (typeof record.value === 'string') {
        blocks.push(codeBlockOrPlain(record.kind, record.value, record.language));
      }
    }
  };
  visit(raw);
  return blocks.map((value) => ({ value }));
}
function codeBlockOrPlain(kind: unknown, value: string, language: unknown): string {
  if (language === undefined && kind !== 'markdown') {
    return value;
  }
  const name = typeof language === 'string' ? language : 'ts';
  return `\`\`\`${name}\n${value}\n\`\`\``;
}
export function toMonacoLocations(
  result: unknown,
  monaco: MonacoApi,
): monacoNs.languages.Location[] {
  const list = Array.isArray(result) ? result : [result];
  const out: monacoNs.languages.Location[] = [];
  for (const item of list) {
    if (item !== null && typeof item === 'object') {
      const location = item as {
        uri?: unknown;
        path?: unknown;
        range?: unknown;
      };
      if (typeof location.uri === 'string') {
        out.push({
          uri: monaco.Uri.parse(location.uri),
          range: toMonacoRange(location.range),
        });
      } else if (typeof location.path === 'string') {
        out.push({
          uri: monaco.Uri.parse(`file:///${location.path.replace(/^\/+/, '')}`),
          range: toMonacoRange(location),
        });
      }
    }
  }
  return out;
}
