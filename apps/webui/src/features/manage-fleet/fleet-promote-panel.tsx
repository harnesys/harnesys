import type { FleetNode } from '@harnesys/contracts';
import { useState } from 'react';
import { acceptPromote, startPromote } from '@/shared/api/fleet';
import { FleetPromoteAcceptSection, FleetPromoteStartSection } from './fleet-promote-sections';

interface FleetPromotePanelProps {
  orgId: string;
  isRelay: boolean;
  nodes: FleetNode[];
  onError: (message: string) => void;
}

export function FleetPromotePanel({ orgId, isRelay, nodes, onError }: FleetPromotePanelProps) {
  const [promoteNodeId, setPromoteNodeId] = useState('');
  const [promoteUrl, setPromoteUrl] = useState('');
  const [promoteToken, setPromoteToken] = useState<string | null>(null);
  const [acceptFrom, setAcceptFrom] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [busy, setBusy] = useState(false);

  const onPromoteStart = async () => {
    if (!promoteNodeId.trim() || !promoteUrl.trim()) {
      onError('Select a worker and new relay URL');
      return;
    }
    setBusy(true);
    try {
      const result = await startPromote(orgId, {
        targetNodeId: promoteNodeId.trim(),
        newRelayUrl: promoteUrl.trim(),
      });
      setPromoteToken(result.promoteToken);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPromoteAccept = async () => {
    if (!acceptFrom.trim() || !acceptToken.trim()) {
      onError('Source relay URL and promote token are required');
      return;
    }
    setBusy(true);
    try {
      await acceptPromote({
        orgId,
        sourceRelayUrl: acceptFrom.trim(),
        promoteToken: acceptToken.trim(),
      });
      window.location.reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (isRelay) {
    return (
      <FleetPromoteStartSection
        nodes={nodes}
        promoteNodeId={promoteNodeId}
        onPromoteNodeIdChange={setPromoteNodeId}
        promoteUrl={promoteUrl}
        onPromoteUrlChange={setPromoteUrl}
        promoteToken={promoteToken}
        busy={busy}
        onStart={() => {
          void onPromoteStart();
        }}
      />
    );
  }

  return (
    <FleetPromoteAcceptSection
      acceptFrom={acceptFrom}
      onAcceptFromChange={setAcceptFrom}
      acceptToken={acceptToken}
      onAcceptTokenChange={setAcceptToken}
      busy={busy}
      onAccept={() => {
        void onPromoteAccept();
      }}
    />
  );
}
