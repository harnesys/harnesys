import type { ConnectorPublic, ConnectorStatus, MirrorPolicyPublic } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useOpenThreadTab } from '@/features/ide';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Pane } from '@/shared/ui/capability-rows';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import {
  agentConnectorsQuery,
  agentConnectorsQueryKey,
  issueTelegramPairCode,
  patchTelegramPolicy,
  pauseTelegramConnector,
  removeTelegramConnector,
  resumeTelegramConnector,
  unpairTelegramConnector,
  upsertTelegramConnector,
} from '../model/connector-api';
import { AgentConnectorPolicy } from './agent-connector-policy';

const STATUS_LABEL: Record<ConnectorStatus, string> = {
  awaiting_pair: 'Awaiting pair',
  active: 'Active',
  paused: 'Paused',
  error: 'Error',
};

interface PairInfo {
  pairCode: string;
  pairUrl: string;
}

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

  const saveMutation = useMutation({
    mutationFn: () => upsertTelegramConnector(orgId, agentId, token),
    onSuccess: async (result) => {
      setToken('');
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
      toast.add({ title: 'Telegram connector saved' });
    },
    onError: (error) => {
      toast.add({ title: 'Save failed', description: errorMessage(error) });
    },
  });

  const pairMutation = useMutation({
    mutationFn: () => issueTelegramPairCode(orgId, agentId),
    onSuccess: async (result) => {
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Could not generate link', description: errorMessage(error) });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Pause failed', description: errorMessage(error) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Resume failed', description: errorMessage(error) });
    },
  });

  const unpairMutation = useMutation({
    mutationFn: () => unpairTelegramConnector(orgId, agentId),
    onSuccess: async (result) => {
      setPairInfo({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Unpair failed', description: errorMessage(error) });
    },
  });

  const policyMutation = useMutation({
    mutationFn: (policy: MirrorPolicyPublic) => patchTelegramPolicy(orgId, agentId, policy),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Policy update failed', description: errorMessage(error) });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeTelegramConnector(orgId, agentId),
    onSuccess: async () => {
      setPairInfo(null);
      setToken('');
      await invalidate();
      toast.add({ title: 'Telegram connector removed' });
    },
    onError: (error) => {
      toast.add({ title: 'Remove failed', description: errorMessage(error) });
    },
  });

  const busy =
    saveMutation.isPending ||
    pairMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    unpairMutation.isPending ||
    policyMutation.isPending ||
    removeMutation.isPending;

  async function confirmRemove() {
    const ok = await alert.confirm({
      title: 'Remove Telegram connector?',
      description: 'The bot token is deleted. The thread stays as a regular chat.',
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
        onOpenThread={() => {
          if (connector) {
            openThreadTab(orgId, agentId, connector.threadId);
          }
        }}
        onPolicyChange={(policy) => policyMutation.mutate(policy)}
      />
    </Pane>
  );
}

function TelegramConnectorCard({
  connector,
  token,
  pairInfo,
  busy,
  canSave,
  onTokenChange,
  onSave,
  onGenerateLink,
  onPause,
  onResume,
  onUnpair,
  onRemove,
  onOpenThread,
  onPolicyChange,
}: {
  connector: ConnectorPublic | null;
  token: string;
  pairInfo: PairInfo | null;
  busy: boolean;
  canSave: boolean;
  onTokenChange: (value: string) => void;
  onSave: () => void;
  onGenerateLink: () => void;
  onPause: () => void;
  onResume: () => void;
  onUnpair: () => void;
  onRemove: () => void;
  onOpenThread: () => void;
  onPolicyChange: (policy: MirrorPolicyPublic) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3"
      data-testid="agent-connector-telegram"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-sm">Telegram</p>
        {connector ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {STATUS_LABEL[connector.status]}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">Not connected</span>
        )}
      </div>

      {connector?.botUsername ? (
        <p className="font-mono text-muted-foreground text-xs">@{connector.botUsername}</p>
      ) : null}

      {connector?.lastError ? (
        <p className="text-destructive text-xs" data-testid="agent-connector-last-error">
          {connector.lastError}
        </p>
      ) : null}

      <Field className="gap-1.5">
        <FieldLabel htmlFor="connector-bot-token">Bot token</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="connector-bot-token"
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder={connector ? '••••••••' : '123456:ABC…'}
            value={token}
            disabled={busy}
            onChange={(event) => onTokenChange(event.target.value)}
          />
          <Button type="button" size="sm" disabled={!canSave} onClick={onSave}>
            Save
          </Button>
        </div>
      </Field>

      {connector ? (
        <>
          <PairSection pairInfo={pairInfo} busy={busy} onGenerateLink={onGenerateLink} />
          <div className="flex flex-wrap gap-2">
            {connector.status === 'paused' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onResume}>
                Resume
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPause}>
                Pause
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onUnpair}>
              Unpair
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onOpenThread}
            >
              Open thread
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
          <AgentConnectorPolicy
            policy={connector.policy}
            disabled={busy}
            onChange={onPolicyChange}
          />
        </>
      ) : null}
    </div>
  );
}

function PairSection({
  pairInfo,
  busy,
  onGenerateLink,
}: {
  pairInfo: PairInfo | null;
  busy: boolean;
  onGenerateLink: () => void;
}) {
  if (pairInfo) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed px-2 py-2 text-xs">
        <a
          href={pairInfo.pairUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-status-info underline-offset-2 hover:underline"
        >
          {pairInfo.pairUrl}
        </a>
        <p className="font-mono text-muted-foreground">{pairInfo.pairCode}</p>
      </div>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onGenerateLink}>
      Generate a new link
    </Button>
  );
}
