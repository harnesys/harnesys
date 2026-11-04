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
import { TelegramDiscovery } from './telegram-discovery';
import { CONNECTOR_STATUS_LABEL, CONNECTOR_STATUS_TONE, type PairInfo } from './telegram-status';

const POLICY_ROWS: ReadonlyArray<{ key: keyof MirrorPolicyPublic; label: string; hint: string }> = [
  { key: 'text', label: 'Agent replies', hint: 'Final answers and streamed text' },
  { key: 'ask', label: 'Questions and approvals', hint: 'Buttons that unblock a run' },
  { key: 'failures', label: 'Failures', hint: 'Run errors and stops' },
  { key: 'files', label: 'Files', hint: 'Attachments produced by an agent' },
  { key: 'appUserEcho', label: 'Messages typed in Harnesys', hint: 'Mirror your own prompts' },
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
  const [tokenOpen, setTokenOpen] = useState(false);
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
      setTokenOpen(false);
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
      toast.add({
        title: 'Direct messages unpaired',
        description: 'Groups and channels are kept.',
      });
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
  const connected = connector.bindings.filter((binding) => binding.threadId !== null).length;

  async function confirmRemove(): Promise<void> {
    const ok = await alert.confirm({
      title: `Remove @${connector.botUsername}?`,
      description:
        'The token is deleted and its chats are forgotten. Threads and their history stay in Harnesys.',
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
      description: 'Groups and channels stay connected. A new pair link is issued.',
      confirmText: 'Unpair',
      testId: 'telegram-unpair-dialog',
    });
    if (ok) {
      unpair.mutate();
    }
  }

  return (
    <article
      className="flex flex-col gap-4 rounded-xl border bg-popover p-4"
      data-testid="telegram-bot-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-base">@{connector.botUsername}</span>
            <RowChip tone={CONNECTOR_STATUS_TONE[connector.status]}>
              {CONNECTOR_STATUS_LABEL[connector.status]}
            </RowChip>
          </div>
          <span className="text-muted-foreground text-xs">
            {connector.bindings.length} chats · {connected} connected · bot id{' '}
            <span className="font-mono">{connector.botId}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={telegramBotGroupLink(connector.botUsername)}
            target="_blank"
            rel="noreferrer"
            className="text-status-info text-xs underline-offset-2 hover:underline"
          >
            Add to a group or channel
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
      </header>

      {connector.lastError ? (
        <p
          className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-destructive text-xs"
          data-testid="telegram-bot-error"
        >
          {connector.lastError}
        </p>
      ) : null}
      {connector.capabilityWarning ? (
        <p className="text-status-warn text-xs">{connector.capabilityWarning}</p>
      ) : null}

      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px]">Direct messages</span>
          <span className="text-[11px] text-muted-foreground">
            Create a link, open it, and send /start so this bot can receive DMs.
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => pairMutation.mutate()}
        >
          {pair ? 'New pair link' : 'Pair direct messages'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void confirmUnpair()}
        >
          Unpair
        </Button>
        {pair ? (
          <div className="flex w-full flex-col gap-0.5 border-t pt-2 text-xs">
            <a
              href={pair.pairUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-status-info underline-offset-2 hover:underline"
            >
              {pair.pairUrl}
            </a>
            <span className="text-[11px] text-muted-foreground">
              or send <span className="font-mono">{pair.pairCode}</span> to the bot
            </span>
          </div>
        ) : null}
      </section>

      <TelegramDiscovery
        orgId={orgId}
        connector={connector}
        initialThreadId={initialThreadId}
        onChanged={onChanged}
      />

      <section className="flex flex-col gap-2 border-t pt-3">
        <div>
          <p className="font-medium text-sm">What gets mirrored to Telegram</p>
          <p className="text-muted-foreground text-xs">
            Only agents' output goes out. Your Harnesys messages stay here unless the last switch is
            on.
          </p>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {POLICY_ROWS.map((row) => (
            <Field
              key={row.key}
              orientation="horizontal"
              className="items-center rounded-md px-1.5 py-1 hover:bg-muted/60"
            >
              <FieldLabel
                htmlFor={`telegram-policy-${connector.id}-${row.key}`}
                className="flex flex-1 flex-col items-start gap-0 font-normal"
              >
                <span className="text-[13px]">{row.label}</span>
                <span className="text-[11px] text-muted-foreground">{row.hint}</span>
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
      </section>

      <footer className="flex flex-wrap items-center gap-2 border-t pt-3">
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
          variant="ghost"
          disabled={busy}
          onClick={() => setTokenOpen((open) => !open)}
        >
          {tokenOpen ? 'Cancel token change' : 'Replace token'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="ml-auto"
          disabled={busy}
          onClick={() => void confirmRemove()}
        >
          Remove bot
        </Button>
      </footer>

      {tokenOpen ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`telegram-token-${connector.id}`}>New bot token</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`telegram-token-${connector.id}`}
              type="password"
              autoComplete="off"
              className="font-mono"
              placeholder="123456:ABC-DEF…"
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
          <p className="text-[11px] text-muted-foreground">
            Replacing the token keeps chats and threads; the new bot must be the same bot.
          </p>
        </Field>
      ) : null}
    </article>
  );
}
