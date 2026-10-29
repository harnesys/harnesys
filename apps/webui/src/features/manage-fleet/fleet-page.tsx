import type { FleetNode } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { useOrgStore } from '@/features/switch-org/org-context';
import { disconnectNode, fleetNodesQuery, removeNode, watchFleetChanged } from '@/shared/api';
import {
  type ActiveInvite,
  type ConnectInfo,
  fetchConnectInfo,
  issueInvite,
  listInvites,
  revokeInvite,
  rotateNode,
  selfNodeCached,
} from '@/shared/api/fleet';
import { deleteOrg, listOrgs } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import {
  confirmDisconnectHost,
  confirmLeaveOrganization,
  confirmRemoveHost,
  confirmRotateHostToken,
} from './fleet-host-dialogs';
import { summarizeHosts } from './fleet-host-status';
import { FleetHostsSection } from './fleet-hosts-table';
import { FleetInvitesSection } from './fleet-invites-section';
import { FleetStatusSection } from './fleet-page-header';
import { FleetPromotePanel } from './fleet-promote-panel';
import { openRotateNodeTokenDialog } from './rotate-node-token-dialog';

export function FleetPage({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { orgs, setOrgs, setActiveOrgId } = useOrgStore();
  const entry = orgs.find((row) => row.orgId === orgId);
  const isRelay = entry?.role === 'relay';
  const deskRole = isRelay ? 'relay' : 'worker';
  const localNodeId = selfNodeCached();
  const queryClient = useQueryClient();

  const {
    data: nodes = [],
    isPending: nodesPending,
    isError: nodesFailed,
    error: nodesQueryError,
    refetch: refetchNodes,
  } = useQuery(fleetNodesQuery);

  const [invites, setInvites] = useState<ActiveInvite[]>([]);
  const [connectInfo, setConnectInfo] = useState<ConnectInfo | null>(null);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodeName, setNodeName] = useState('worker');
  const [issuedInvite, setIssuedInvite] = useState<{
    code: string;
    relayUrl: string;
    orgId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const relayHint = resolveRelayHint(entry?.relayUrl, connectInfo);
  let nodesErrorMessage: string | null = null;
  if (nodesFailed) {
    nodesErrorMessage =
      nodesQueryError instanceof Error ? nodesQueryError.message : 'Failed to load fleet hosts';
  }
  const bannerError = error ?? nodesErrorMessage;

  const refreshInvitesAndInfo = async () => {
    if (!orgId) {
      return;
    }
    setError(null);
    try {
      const info = await fetchConnectInfo();
      setConnectInfo(info);
      setInvites(await listInvites(orgId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!orgId) {
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const info = await fetchConnectInfo();
        if (cancelled) {
          return;
        }
        setConnectInfo(info);
        const inviteRows = await listInvites(orgId);
        if (!cancelled) {
          setInvites(inviteRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    setLastUpdated(Date.now());
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchFleetChanged(
      orgId,
      () => {
        setLive(true);
        setLastUpdated(Date.now());
        void queryClient.invalidateQueries({ queryKey: ['fleet', 'nodes'] });
      },
      {
        onOpen: () => {
          setLive(true);
          setLastUpdated(Date.now());
          void queryClient.invalidateQueries({ queryKey: ['fleet', 'nodes'] });
        },
        onError: () => {
          setLive(false);
        },
      },
    );
  }, [orgId, queryClient]);

  const onIssue = async () => {
    if (!orgId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const issued = await issueInvite(orgId, { nodeName });
      const relayUrl = issued.relayUrlHint ?? relayHint ?? window.location.origin;
      setIssuedInvite({ code: issued.code, relayUrl, orgId });
      await refreshInvitesAndInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runHostAction = async (node: FleetNode, action: () => Promise<void>) => {
    setActionBusyId(node.id);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['fleet', 'nodes'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const onDisconnect = async (node: FleetNode) => {
    if (!orgId || !(await confirmDisconnectHost(node.name))) {
      return;
    }
    await runHostAction(node, () => disconnectNode(orgId, node.id));
  };

  const onRemove = async (node: FleetNode) => {
    if (!orgId || !(await confirmRemoveHost(node.name))) {
      return;
    }
    await runHostAction(node, () => removeNode(orgId, node.id));
  };

  const onRotate = async (node: FleetNode) => {
    if (!orgId || !(await confirmRotateHostToken(node.name))) {
      return;
    }
    setActionBusyId(node.id);
    setError(null);
    try {
      const result = await rotateNode(orgId, node.id);
      await queryClient.invalidateQueries({ queryKey: ['fleet', 'nodes'] });
      await openRotateNodeTokenDialog({ nodeName: node.name, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const onLeave = async (node: FleetNode) => {
    if (!orgId || !(await confirmLeaveOrganization(entry?.name ?? 'organization'))) {
      return;
    }
    setActionBusyId(node.id);
    setError(null);
    try {
      await removeNode(orgId, node.id);
      try {
        await deleteOrg(orgId);
      } catch {
        // NODE_REMOVED may already have cleared the local entry
      }
      const response = await listOrgs();
      setOrgs(response.orgs);
      const nextId =
        response.activeOrgId && response.orgs.some((row) => row.orgId === response.activeOrgId)
          ? response.activeOrgId
          : (response.orgs[0]?.orgId ?? null);
      setActiveOrgId(nextId);
      if (nextId) {
        void navigate(studioPath.desk(nextId), { replace: true });
      } else {
        void navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActionBusyId(null);
    }
  };

  const presence = nodesPending ? null : summarizeHosts(nodes);

  const onRetry = () => {
    setError(null);
    void refreshInvitesAndInfo();
    void refetchNodes();
  };

  return (
    <div className="flex w-full flex-col gap-8" data-testid="fleet-page">
      {bannerError ? (
        <SettingsErrorBanner message={bannerError} onRetry={onRetry} testId="fleet-error" />
      ) : null}

      <FleetStatusSection
        isRelay={isRelay}
        live={live}
        lastUpdated={lastUpdated}
        relayHint={relayHint}
        orgId={entry?.orgId}
        loading={nodesPending}
        summary={presence}
      />

      <FleetHostsSection
        nodes={nodes}
        deskRole={deskRole}
        localNodeId={localNodeId}
        loading={nodesPending}
        actionBusyId={actionBusyId}
        onIssueInvite={
          isRelay
            ? () => {
                void onIssue();
              }
            : undefined
        }
        onDisconnect={(node) => {
          void onDisconnect(node);
        }}
        onRotate={(node) => {
          void onRotate(node);
        }}
        onRemove={(node) => {
          void onRemove(node);
        }}
        onLeave={(node) => {
          void onLeave(node);
        }}
      />

      <FleetInvitesSection
        canIssue={isRelay}
        nodeName={nodeName}
        onNodeNameChange={setNodeName}
        busy={busy}
        onIssue={() => {
          void onIssue();
        }}
        issuedInvite={issuedInvite}
        invites={invites}
        onRevoke={(inviteId) => {
          void revokeInvite(orgId, inviteId)
            .then(() => refreshInvitesAndInfo())
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            });
        }}
      />

      <FleetPromotePanel
        orgId={orgId}
        isRelay={isRelay}
        nodes={nodes}
        onError={(message) => {
          setError(message);
        }}
      />
    </div>
  );
}

function resolveRelayHint(
  entryRelayUrl: string | null | undefined,
  connectInfo: ConnectInfo | null,
): string | null {
  const fromEntry = entryRelayUrl?.trim();
  if (fromEntry) {
    return fromEntry;
  }
  const fromConnect = connectInfo?.relayUrlHint?.trim() || connectInfo?.publicOrigin?.trim();
  if (!fromConnect) {
    return null;
  }
  if (fromConnect.startsWith('http://') || fromConnect.startsWith('https://')) {
    return fromConnect;
  }
  return `https://${fromConnect}`;
}
