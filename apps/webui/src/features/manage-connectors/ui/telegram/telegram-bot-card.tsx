import type { ConnectorPublic, MirrorPolicyPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import {
  issueTelegramPairCode,
  patchTelegramPolicy,
  pauseTelegramBot,
  removeTelegramBot,
  resumeTelegramBot,
  telegramBotGroupLink,
  telegramBotLink,
  unpairTelegramBot,
  updateTelegramBot,
} from '../../model/connector-api';
import { TelegramConnectionsTree } from './telegram-connections-tree';
import { CONNECTOR_STATUS_LABEL, CONNECTOR_STATUS_TONE, type PairInfo } from './telegram-status';

const POLICY_ROWS: ReadonlyArray<{ key: keyof MirrorPolicyPublic; label: string }> = [
  { key: 'text', label: 'Assistant text' },
  { key: 'ask', label: 'Questions and approvals' },
  { key: 'failures', label: 'Failures' },
  { key: 'files', label: 'Files' },
  { key: 'appUserEcho', label: 'Messages typed in Harnesys' },
];

export function TelegramBotCard({
  orgId,
  connector,
  initialPair,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connector: ConnectorPublic;
  initialPair: PairInfo | null;
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  const [token, setToken] = useState('');
  const [pair, setPair] = useState<PairInfo | null>(initialPair);

  function failure(title: string) {
    return (error: unknown) => {
      toast.add({
        title,
        description: error instanceof Error ? error.message : 'Request failed',
      });
    };
  }

  const saveToken = useMutation({
    mutationFn: () => updateTelegramBot(orgId, connector.id, token),
    onSuccess: (result) => {
      setToken('');
      setPair({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      onChanged();
      toast.add({ title: 'Bot token updated' });
    },
    onError: failure('Could not update the token'),
  });

  const pairMutation = useMutation({
    mutationFn: () => issueTelegramPairCode(orgId, connector.id),
    onSuccess: (result) => setPair({ pairCode: result.pairCode, pairUrl: result.pairUrl }),
    onError: failure('Could not create a pair link'),
  });

  const pause = useMutation({
    mutationFn: () => pauseTelegramBot(orgId, connector.id),
    onSuccess: onChanged,
    onError: failure('Pause failed'),
  });

  const resume = useMutation({
    mutationFn: () => resumeTelegramBot(orgId, connector.id),
    onSuccess: onChanged,
    onError: failure('Resume failed'),
  });

  const unpair = useMutation({
    mutationFn: () => unpairTelegramBot(orgId, connector.id),
    onSuccess: (result) => {
      setPair({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      onChanged();
      toast.add({ title: 'Direct messages unpaired', description: 'Groups and topics are kept.' });
    },
    onError: failure('Unpair failed'),
  });

  const policy = useMutation({
    mutationFn: (body: MirrorPolicyPublic) => patchTelegramPolicy(orgId, connector.id, body),
    onSuccess: onChanged,
    onError: failure('Policy update failed'),
  });

  const remove = useMutation({
    mutationFn: () => removeTelegramBot(orgId, connector.id),
    onSuccess: () => {
      onChanged();
      toast.add({ title: 'Bot removed' });
    },
    onError: failure('Could not remove the bot'),
  });

  const busy =
    saveToken.isPending ||
    pairMutation.isPending ||
    pause.isPending ||
    resume.isPending ||
    unpair.isPending ||
    policy.isPending ||
    remove.isPending;

  async function confirmRemove(): Promise<void> {
    const ok = await alert.confirm({
      title: 'Remove this bot?',
      description: 'The token is deleted and its chats are forgotten. Threads stay in Harnesys.',
      confirmText: 'Remove',
      variant: 'destructive',
      testId: 'telegram-remove-bot-dialog',
    });
    if (ok) {
      remove.mutate();
    }
  }

  async function confirmUnpair(): Promise<void> {
    const ok = await alert.confirm({
      title: 'Unpair direct messages?',
      description: 'Groups and topics stay connected. A new pair link is issued.',
      confirmText: 'Unpair',
      testId: 'telegram-unpair-dialog',
    });
    if (ok) {
      unpair.mutate();
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-popover p-3"
      data-testid="telegram-bot-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-sm">@{connector.botUsername}</span>
          <span className="font-mono text-[11px] text-muted-foreground">id {connector.botId}</span>
        </div>
        <div className="flex items-center gap-2">
          <RowChip tone={CONNECTOR_STATUS_TONE[connector.status]}>
            {CONNECTOR_STATUS_LABEL[connector.status]}
          </RowChip>
        </div>
      </div>

      {connector.lastError ? (
        <p className="text-destructive text-xs" data-testid="telegram-bot-error">
          {connector.lastError}
        </p>
      ) : null}
      {connector.capabilityWarning ? (
        <p className="text-status-warn text-xs">{connector.capabilityWarning}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={telegramBotGroupLink(connector.botUsername)}
          target="_blank"
          rel="noreferrer"
          className="text-status-info text-xs underline-offset-2 hover:underline"
        >
          Add to a group
        </a>
        <a
          href={telegramBotLink(connector.botUsername)}
          target="_blank"
          rel="noreferrer"
          className="text-status-info text-xs underline-offset-2 hover:underline"
        >
          Open in Telegram
        </a>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Direct messages</p>
        {pair ? (
          <div className="flex flex-col gap-1 rounded-md border border-dashed px-2 py-2 text-xs">
            <a
              href={pair.pairUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-status-info underline-offset-2 hover:underline"
            >
              {pair.pairUrl}
            </a>
            <p className="font-mono text-muted-foreground">{pair.pairCode}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => pairMutation.mutate()}
          >
            {pair ? 'New pair link' : 'Create pair link'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void confirmUnpair()}
          >
            Unpair DMs
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Connections</p>
        <TelegramConnectionsTree
          orgId={orgId}
          connector={connector}
          initialThreadId={initialThreadId}
          onChanged={onChanged}
        />
      </div>

      <Field className="gap-1.5">
        <FieldLabel htmlFor={`telegram-token-${connector.id}`}>Replace bot token</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`telegram-token-${connector.id}`}
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder="••••••••"
            value={token}
            disabled={busy}
            onChange={(event) => setToken(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={!token.trim() || busy}
            onClick={() => saveToken.mutate()}
          >
            Save
          </Button>
        </div>
      </Field>

      <details className="rounded-md border px-2 py-1.5">
        <summary className="cursor-pointer text-muted-foreground text-xs">Mirror policy</summary>
        <div className="flex flex-col gap-1 pt-2">
          {POLICY_ROWS.map((row) => (
            <Field
              key={row.key}
              orientation="horizontal"
              className="rounded-md px-1 py-1 hover:bg-muted/60"
            >
              <FieldLabel
                htmlFor={`telegram-policy-${connector.id}-${row.key}`}
                className="flex-1 font-normal"
              >
                {row.label}
              </FieldLabel>
              <Switch
                id={`telegram-policy-${connector.id}-${row.key}`}
                checked={connector.policy[row.key]}
                disabled={busy}
                onCheckedChange={(checked) =>
                  policy.mutate({ ...connector.policy, [row.key]: checked })
                }
              />
            </Field>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap gap-2 border-t pt-2">
        {connector.status === 'paused' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => resume.mutate()}
          >
            Resume
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => pause.mutate()}
          >
            Pause
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => void confirmRemove()}
        >
          Remove bot
        </Button>
      </div>
    </div>
  );
}
