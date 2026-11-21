import { useCallback, useEffect, useState } from 'react';
import {
  attachLspBridge,
  type LspBridge,
  type LspBridgeStatus,
  type LspGap,
  lspInstallKey,
  offerLspInstall,
  restartLspForActiveOrg,
  runLspInstall,
  useLspInstallStore,
  useLspSessionsStore,
} from '@/features/lsp-bridge';
import { getActiveOrgId } from '@/shared/api/active-org';
import { ensureMonaco, type Monaco } from '@/shared/lib/monaco';
import { toModelPath } from './editor-setup';

export function useEditorLspBridge(projectId: string, path: string | null, languageId: string) {
  const [status, setStatus] = useState<LspBridgeStatus>('off');
  const [pulse, setPulse] = useState(0);
  const [gap, setGap] = useState<LspGap | null>(null);
  const [attachEpoch, setAttachEpoch] = useState(0);
  const installVersion = useLspInstallStore((state) => state.version);
  const orgId = getActiveOrgId() ?? '';
  const installKey = gap?.candidate ? lspInstallKey(orgId, gap.candidate.serverId) : '';
  const installing = useLspInstallStore((state) =>
    installKey ? state.installing[installKey] === true : false,
  );

  useEffect(() => {
    void attachEpoch;
    void installVersion;
    setGap(null);
    if (!path) {
      return;
    }
    let bridge: LspBridge | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;
    let monacoNs: Monaco | null = null;
    const report = (next: LspBridgeStatus, message?: string) => {
      setStatus(next);
      useLspSessionsStore.getState().upsert(projectId, {
        path,
        languageId,
        status: next,
        message,
      });
    };
    const tryAttach = () => {
      if (cancelled || !monacoNs) {
        return;
      }
      attempts += 1;
      const modelPath = toModelPath(path);
      if (monacoNs.editor.getModel(monacoNs.Uri.parse(modelPath))) {
        report('starting');
        bridge = attachLspBridge({
          orgId,
          sourceId: projectId,
          path,
          monaco: monacoNs,
          onStatus: report,
          onGap: setGap,
          onActivity: () => setPulse((n) => n + 1),
        });
        return;
      }
      if (attempts < 20) {
        retryTimer = setTimeout(tryAttach, 100);
      }
    };
    void ensureMonaco().then((ns) => {
      if (cancelled) {
        return;
      }
      monacoNs = ns;
      tryAttach();
    });
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      bridge?.dispose();
      useLspSessionsStore.getState().remove(projectId, path);
      setStatus('off');
    };
  }, [projectId, path, languageId, attachEpoch, installVersion, orgId]);

  useEffect(() => {
    if (!gap || gap.usable || !gap.candidate || !orgId) {
      return;
    }
    offerLspInstall(orgId, gap.candidate);
  }, [gap, orgId]);

  const restartFileServer = useCallback(() => {
    if (!path) {
      return;
    }
    void restartLspForActiveOrg(path)
      .then(() => setAttachEpoch((n) => n + 1))
      .catch(() => {});
  }, [path]);

  const installFileServer = useCallback(() => {
    if (!gap?.candidate || !orgId) {
      return;
    }
    void runLspInstall(orgId, gap.candidate);
  }, [gap, orgId]);

  return { status, pulse, gap, installing, restartFileServer, installFileServer };
}
