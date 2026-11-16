import type * as monacoNs from 'monaco-editor';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  getOrgLsp,
  lspDefinition,
  lspDiagnostics,
  lspHover,
  lspReferences,
  type OrgLspDiagnosticsFrame,
  openOrgLspEvents,
} from '@/shared/api/org-lsp';
import {
  applyMarkers,
  suspendBuiltinDiagnostics,
  toLspPosition,
  toMonacoHover,
  toMonacoLocations,
} from './lsp-converters';
import { type LspGap, resolveLspGap } from './lsp-gap';

export type LspBridgeStatus = 'starting' | 'live' | 'off' | 'error';
export interface LspBridge {
  dispose(): void;
}
export interface LspBridgeArgs {
  orgId: string;
  sourceId: string;
  path: string;
  monaco: typeof monacoNs;
  onStatus: (status: LspBridgeStatus, message?: string) => void;
  onGap?: (gap: LspGap) => void;
  onActivity?: () => void;
}
const CHANGE_DEBOUNCE_MS = 250;
const REQUEST_TIMEOUT_MS = 10000;
let builtinSuspendCount = 0;
let restoreBuiltinDiagnostics: (() => void) | null = null;
function suspendBuiltinOnce(monaco: typeof monacoNs, languageId: string): void {
  if (builtinSuspendCount === 0) {
    restoreBuiltinDiagnostics = suspendBuiltinDiagnostics(monaco, languageId);
  }
  builtinSuspendCount += 1;
}
function resumeBuiltinOnce(): void {
  if (builtinSuspendCount === 0) {
    return;
  }
  builtinSuspendCount -= 1;
  if (builtinSuspendCount === 0) {
    restoreBuiltinDiagnostics?.();
    restoreBuiltinDiagnostics = null;
  }
}

async function checkServerForFile(orgId: string, path: string): Promise<LspGap> {
  return resolveLspGap(await getOrgLsp(orgId), path);
}

export function attachLspBridge(args: LspBridgeArgs): LspBridge {
  const { monaco, onStatus, onGap, onActivity, orgId, sourceId, path } = args;
  const modelUri = `file:///${path.replace(/^\/+/, '')}`;
  const model = monaco.editor.getModel(monaco.Uri.parse(modelUri));
  if (!model) {
    return { dispose: () => {} };
  }
  const languageId = model.getLanguageId();
  let status: LspBridgeStatus = 'starting';
  let disposed = false;
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout> }>();
  const setStatus = (next: LspBridgeStatus) => {
    if (status === next) {
      return;
    }
    status = next;
    onStatus(next);
  };
  setStatus('starting');
  const query = { sourceId, path };
  let serverForFile = false;
  const refreshDiagnostics = (): void => {
    if (!serverForFile) {
      return;
    }
    void lspDiagnostics(orgId, query)
      .then((diagnostics) => {
        applyMarkers(monaco, model, diagnostics);
        setStatus('live');
        onActivity?.();
      })
      .catch((error: unknown) => {
        applyMarkers(monaco, model, []);
        setStatus('off');
        onStatus('off', error instanceof Error ? error.message : 'diagnostics request failed');
      });
  };
  const queryPosition = (
    method: 'hover' | 'definition' | 'references',
    position: {
      lineNumber: number;
      column: number;
    },
  ): Promise<unknown> => {
    if (!serverForFile) {
      return Promise.resolve(null);
    }
    const id = `q${pending.size}-${Date.now()}`;
    const entry = { timer: setTimeout(() => pending.delete(id), REQUEST_TIMEOUT_MS) };
    pending.set(id, entry);
    const pos = toLspPosition(position);
    const input = { ...query, ...pos };
    let request: Promise<unknown>;
    if (method === 'hover') {
      request = lspHover(orgId, input);
    } else if (method === 'definition') {
      request = lspDefinition(orgId, input);
    } else {
      request = lspReferences(orgId, input);
    }
    return request.finally(() => {
      clearTimeout(entry.timer);
      pending.delete(id);
    });
  };
  const closeSse = openOrgLspEvents(orgId, sourceId, (frame) => {
    applyFrame(monaco, model, path, frame);
    setStatus('live');
    onActivity?.();
  });
  void checkServerForFile(orgId, path)
    .then((gap) => {
      if (disposed) {
        return;
      }
      onGap?.(gap);
      if (!gap.usable) {
        setStatus('off');
        onStatus('off', gap.message);
        return;
      }
      serverForFile = true;
      suspendBuiltinOnce(monaco, languageId);
      refreshDiagnostics();
    })
    .catch(() => {
      if (disposed) {
        return;
      }
      serverForFile = true;
      suspendBuiltinOnce(monaco, languageId);
      refreshDiagnostics();
    });
  const changeSubscription = model.onDidChangeContent(() => {
    if (changeTimer) {
      clearTimeout(changeTimer);
    }
    changeTimer = setTimeout(() => {
      changeTimer = null;
      refreshDiagnostics();
    }, CHANGE_DEBOUNCE_MS);
  });
  const hoverProvider = monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (_target, position) =>
      toMonacoHover(await queryPosition('hover', position)),
  });
  const definitionProvider = monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (_target, position) =>
      toMonacoLocations(await queryPosition('definition', position), monaco),
  });
  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (changeTimer) {
        clearTimeout(changeTimer);
      }
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
      }
      pending.clear();
      changeSubscription.dispose();
      hoverProvider.dispose();
      definitionProvider.dispose();
      closeSse();
      resumeBuiltinOnce();
      setStatus('off');
    },
  };
}

function applyFrame(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  path: string,
  frame: OrgLspDiagnosticsFrame,
): void {
  const relevant = frame.diagnostics.filter((item) => item.path === path);
  applyMarkers(monaco, model, relevant);
}

export function orgIdForLsp(): string | null {
  return getActiveOrgId();
}
