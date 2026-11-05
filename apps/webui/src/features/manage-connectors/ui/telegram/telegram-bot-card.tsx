import type { ConnectorPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner, SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import {
  pauseTelegramBot,
  refreshTelegramChats,
  removeTelegramBot,
  resumeTelegramBot,
  telegramBotGroupLink,
  telegramBotLink,
  updateTelegramBot,
} from '../../model/connector-api';
import { TelegramBotPolicy } from './telegram-bot-policy';
import { TelegramDiscovery } from './telegram-discovery';
import { CONNECTOR_STATUS_LABEL, CONNECTOR_STATUS_TONE } from './telegram-status';

export function TelegramBotCard({
  orgId,
  connector,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connector: ConnectorPublic;
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  const [token, setToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);

  function failure(title: string) {
    return (error: unknown) => {
      toast.add({
        title,
        description: error instanceof Error ? error.message : 'Request failed',
      });
    };
  }

  const refresh = useMutation({
    mutationFn: () => refreshTelegramChats(orgId, connector.id),
    onSuccess: (result) => {
      onChanged();
      if (result.issues.length === 0) {
        toast.add({ title: 'Chats and names are up to date' });
        return;
      }
      toast.add({
        title: `${result.issues.length} chats need attention`,
        description: `${result.issues[0]?.message ?? ''} Without access those chats receive nothing.`,
      });
    },
    onError: failure('Could not reach Telegram'),
  });

  const saveToken = useMutation({
    mutationFn: () => updateTelegramBot(orgId, connector.id, token),
    onSuccess: () => {
      setToken('');
      setTokenOpen(false);
      onChanged();
      toast.add({ title: 'Bot token updated' });
    },
    onError: failure('Could not update the token'),
  });

  const pause = useMutation({
    mutationFn: () => pauseTelegramBot(orgId, connector.id),
    onSuccess: () => {
      onChanged();
      toast.add({ title: 'Bot paused', description: 'No messages are read until you resume.' });
    },
    onError: failure('Pause failed'),
  });

  const resume = useMutation({
    mutationFn: () => resumeTelegramBot(orgId, connector.id),
    onSuccess: () => {
      onChanged();
      toast.add({ title: 'Bot restarted' });
    },
    onError: failure('Restart failed'),
  });

  const remove = useMutation({
    mutationFn: () => removeTelegramBot(orgId, connector.id),
    onSuccess: () => {
      onChanged();
      toast.add({ title: 'Bot removed' });
    },
    onError: failure('Could not remove the bot'),
  });

  const busy = refresh.isPending || saveToken.isPending || pause.isPending || remove.isPending;
  const connected = connector.bindings.filter((binding) => binding.threadId !== null).length;
  const stopped = connector.status === 'paused' || connector.status === 'error';

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
            {connector.bindings.length} chats · {connected} connected to threads
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => refresh.mutate()}
          >
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Bot actions"
                  data-testid="telegram-bot-menu"
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {stopped ? (
                <DropdownMenuItem onClick={() => resume.mutate()}>Restart bot</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => pause.mutate()}>Pause bot</DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setTokenOpen((open) => !open)}
                disabled={saveToken.isPending}
              >
                {tokenOpen ? 'Cancel token change' : 'Replace token'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void confirmRemove()}>
                Remove bot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {connector.lastError ? (
        <SettingsErrorBanner
          message={connector.lastError}
          onRetry={() => resume.mutate()}
          testId="telegram-bot-error"
        />
      ) : null}
      {connector.capabilityWarning ? (
        <SettingsWarnBanner
          title="Privacy mode limits what this bot reads"
          testId="telegram-bot-warning"
        >
          {connector.capabilityWarning}
        </SettingsWarnBanner>
      ) : null}
      {connector.status === 'paused' ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-[13px] text-muted-foreground">
          Paused. Messages from Telegram are not read until the bot is restarted.
        </p>
      ) : null}

      <TelegramDiscovery
        orgId={orgId}
        connector={connector}
        initialThreadId={initialThreadId}
        onChanged={onChanged}
        onRefresh={() => refresh.mutate()}
        refreshing={refresh.isPending}
        busy={busy}
      />

      <TelegramBotPolicy orgId={orgId} connector={connector} onChanged={onChanged} busy={busy} />

      {tokenOpen ? (
        <Field className="gap-1.5 border-t pt-3">
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
            Only the token of the same bot is accepted; chats and threads stay connected.
          </p>
        </Field>
      ) : null}
    </article>
  );
}
