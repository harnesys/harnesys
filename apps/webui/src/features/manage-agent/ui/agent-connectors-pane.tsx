import type { MirrorPolicyPublic } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useOpenThreadTab } from '@/features/ide';
import { alert } from '@/shared/services/overlay';
import { Pane } from '@/shared/ui/capability-rows';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import {
  addConnectorAgent,
  agentConnectorsQuery,
  agentConnectorsQueryKey,
  connectConnectorBinding,
  disconnectConnectorBinding,
  issueTelegramPairCode,
  patchTelegramPolicy,
  pauseTelegramConnector,
  removeConnectorAgent,
  removeTelegramConnector,
  resumeTelegramConnector,
  unpairTelegramConnector,
  upsertTelegramConnector,
} from '../model/connector-api';
import { type PairInfo, TelegramConnectorCard } from './agent-connector-card';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

export function AgentConnectorsPane({ orgId, agentId }: { orgId: string; agentId: string }) {
  const queryClient = useQueryClient();
  const openThreadTab = useOpenThreadTab();
  const connectorsQuery = useQuery(agentConnectorsQuery(orgId, agentId));
  const connector =
    connectorsQuery.data?.items.find((item) => item.provider === 'telegram') ?? null;
  const [token, setToken] = useState('');
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: agentConnectorsQueryKey(orgId, agentId) });
  }

  function onFailure(title: string) {
    return (error: unknown) => {
      toast.add({ title, description: errorMessage(error) });
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => upsertTelegramConnector(orgId, agentId, token),
    onSuccess: async (result) => {
      setToken('');
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
      toast.add({ title: 'Telegram connector saved' });
    },
    onError: onFailure('Save failed'),
  });

  const pairMutation = useMutation({
    mutationFn: () => issueTelegramPairCode(orgId, agentId),
    onSuccess: async (result) => {
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
    },
    onError: onFailure('Could not generate link'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      await invalidate();
    },
    onError: onFailure('Pause failed'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      await invalidate();
    },
    onError: onFailure('Resume failed'),
  });

  const unpairMutation = useMutation({
    mutationFn: () => unpairTelegramConnector(orgId, agentId),
    onSuccess: async (result) => {
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
    },
    onError: onFailure('Unpair failed'),
  });

  const policyMutation = useMutation({
    mutationFn: (policy: MirrorPolicyPublic) => patchTelegramPolicy(orgId, agentId, policy),
    onSuccess: invalidate,
    onError: onFailure('Policy update failed'),
  });

  const addAgentMutation = useMutation({
    mutationFn: (memberAgentId: string) => addConnectorAgent(orgId, agentId, memberAgentId),
    onSuccess: invalidate,
    onError: onFailure('Could not add agent'),
  });

  const removeAgentMutation = useMutation({
    mutationFn: (memberAgentId: string) => removeConnectorAgent(orgId, agentId, memberAgentId),
    onSuccess: invalidate,
    onError: onFailure('Could not remove agent'),
  });

  const connectMutation = useMutation({
    mutationFn: (input: { bindingId: string; autoReplyAgentId: string | null }) =>
      connectConnectorBinding(orgId, agentId, input.bindingId, {
        autoReplyAgentId: input.autoReplyAgentId,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Chat connected' });
    },
    onError: onFailure('Could not connect chat'),
  });

  const disconnectMutation = useMutation({
    mutationFn: (bindingId: string) => disconnectConnectorBinding(orgId, agentId, bindingId),
    onSuccess: invalidate,
    onError: onFailure('Could not disconnect chat'),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      setToken('');
      await invalidate();
      toast.add({ title: 'Telegram connector removed' });
    },
    onError: onFailure('Remove failed'),
  });

  const busy =
    saveMutation.isPending ||
    pairMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    unpairMutation.isPending ||
    policyMutation.isPending ||
    removeMutation.isPending ||
    addAgentMutation.isPending ||
    removeAgentMutation.isPending ||
    connectMutation.isPending ||
    disconnectMutation.isPending;

  async function confirmRemove() {
    const ok = await alert.confirm({
      title: 'Remove Telegram connector?',
      description: 'The bot token is deleted. Chats stay as regular threads.',
      confirmText: 'Remove',
      variant: 'destructive',
      testId: 'remove-telegram-connector-dialog',
    });
    if (ok) {
      removeMutation.mutate();
    }
  }

  return (
    <Pane
      testId="agent-connectors-pane"
      label="Connectors"
      description="Link this agent to messaging providers. Telegram is available in v1."
    >
      {connectorsQuery.isPending ? <RowListSkeleton testId="connectors-loading" /> : null}
      <TelegramConnectorCard
        orgId={orgId}
        connector={connector}
        token={token}
        pairInfo={pairInfo}
        busy={busy}
        canSave={token.trim().length > 0 && !busy}
        onTokenChange={setToken}
        onSave={() => saveMutation.mutate()}
        onGenerateLink={() => pairMutation.mutate()}
        onPause={() => pauseMutation.mutate()}
        onResume={() => resumeMutation.mutate()}
        onUnpair={() => unpairMutation.mutate()}
        onRemove={() => {
          void confirmRemove();
        }}
        onAddAgent={(memberAgentId) => addAgentMutation.mutate(memberAgentId)}
        onRemoveAgent={(memberAgentId) => removeAgentMutation.mutate(memberAgentId)}
        onConnect={(bindingId, autoReplyAgentId) =>
          connectMutation.mutate({ bindingId, autoReplyAgentId })
        }
        onDisconnect={(bindingId) => disconnectMutation.mutate(bindingId)}
        onOpenThread={(threadId) => openThreadTab(orgId, agentId, threadId)}
        onPolicyChange={(policy) => policyMutation.mutate(policy)}
      />
    </Pane>
  );
}
