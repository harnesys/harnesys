import type { IdentityLink, IssueIdentityLinkCodeResponse } from '@harnesys/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, ExternalLinkIcon, LinkIcon } from 'lucide-react';
import { useState } from 'react';
import {
  identityLinksQuery,
  issueIdentityLinkCode,
  unlinkIdentity,
} from '@/shared/api/identity-links';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { telegramBotLink, telegramIdentityLink } from '../../model/connector-api';
import { formatExpiry } from './telegram-status';

const TELEGRAM_PROVIDER = 'telegram';

function telegramLink(links: IdentityLink[] | undefined): IdentityLink | undefined {
  return links?.find((link) => link.provider === TELEGRAM_PROVIDER);
}

function identityLabel(link: IdentityLink): string {
  if (link.displayName) {
    return link.displayName;
  }
  return link.handle ? `@${link.handle}` : link.providerUserId;
}

function identityHandle(link: IdentityLink): string | null {
  if (!link.handle) {
    return null;
  }
  return link.displayName ? `@${link.handle}` : null;
}

function errorDescription(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

interface CodePanelProps {
  botUsername?: string;
  code: IssueIdentityLinkCodeResponse;
  busy: boolean;
  isFetching: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onNewCode: () => void;
}

function IdentityCodePanel({
  botUsername,
  code,
  busy,
  isFetching,
  onCopy,
  onRefresh,
  onNewCode,
}: CodePanelProps) {
  const destination = botUsername ? `@${botUsername}` : 'the bot';
  const deepLink = botUsername ? telegramIdentityLink(botUsername, code.code) : null;
  const expiresAt = Date.parse(code.expiresAt);

  return (
    <div className="flex flex-col gap-3" data-testid="telegram-identity-code-panel">
      <code
        className="select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-lg"
        data-testid="telegram-identity-code"
      >
        {code.code}
      </code>
      <p className="text-[13px] leading-relaxed">
        Open {destination} and send <span className="font-mono">/link {code.code}</span>.
      </p>
      {Number.isNaN(expiresAt) ? null : (
        <p className="text-[11px] text-muted-foreground">
          Expires at {formatExpiry(expiresAt)}. The code works once.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {deepLink ? (
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
            data-testid="telegram-identity-open-bot"
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open {destination}
          </a>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCopy}
          data-testid="telegram-identity-code-copy"
        >
          <CopyIcon data-icon="inline-start" />
          Copy command
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={onRefresh}
          data-testid="telegram-identity-refresh"
        >
          {isFetching ? 'Checking...' : 'I sent it · Refresh'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onNewCode}
          data-testid="telegram-identity-new-code"
        >
          Get a new code
        </Button>
      </div>
    </div>
  );
}

export function TelegramIdentityCard({ botUsername }: { botUsername?: string }) {
  const links = useQuery(identityLinksQuery());
  const [code, setCode] = useState<IssueIdentityLinkCodeResponse | null>(null);
  const link = telegramLink(links.data?.links);

  const issueCode = useMutation({
    mutationFn: () => issueIdentityLinkCode(TELEGRAM_PROVIDER),
    onSuccess: (result) => {
      setCode(result);
    },
    onError: (error: unknown) => {
      toast.add({ title: 'Could not create a link code', description: errorDescription(error) });
    },
  });

  const unlink = useMutation({
    mutationFn: () => unlinkIdentity(TELEGRAM_PROVIDER),
    onSuccess: () => {
      setCode(null);
      void links.refetch();
      toast.add({ title: 'Telegram account unlinked' });
    },
    onError: (error: unknown) => {
      toast.add({ title: 'Could not unlink the account', description: errorDescription(error) });
    },
  });

  async function copyCommand(): Promise<void> {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`/link ${code.code}`);
      toast.add({ title: 'Command copied' });
    } catch {
      toast.add({ title: 'Could not copy the command' });
    }
  }

  async function confirmUnlink(): Promise<void> {
    if (!link) {
      return;
    }
    const ok = await alert.confirm({
      title: 'Unlink this Telegram account?',
      description: `Messages from ${identityLabel(link)} will stop being attributed to you. You can link it again with a new code.`,
      confirmText: 'Unlink',
      variant: 'destructive',
      testId: 'telegram-identity-unlink-dialog',
    });
    if (ok) {
      unlink.mutate();
    }
  }

  const destination = botUsername ? `@${botUsername}` : 'the bot';
  const botLink = botUsername ? telegramBotLink(botUsername) : null;
  const busy = issueCode.isPending || unlink.isPending;
  const handle = link ? identityHandle(link) : null;

  return (
    <Card className="gap-4 bg-popover p-4" data-testid="telegram-identity-card">
      <header className="flex flex-col gap-0.5">
        <span className="font-medium text-base">Telegram identity</span>
        <span className="text-muted-foreground text-xs">
          Link your Harnesys account to Telegram so your messages carry your name. The link works
          across all workspaces.
        </span>
      </header>

      {links.isPending ? (
        <p className="text-[13px] text-muted-foreground" data-testid="telegram-identity-loading">
          Checking the link...
        </p>
      ) : null}

      {links.isError ? (
        <SettingsErrorBanner
          message={errorDescription(links.error)}
          onRetry={() => void links.refetch()}
          testId="telegram-identity-error"
        />
      ) : null}

      {link ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          data-testid="telegram-identity-linked"
        >
          <span className="flex min-w-0 items-center gap-2 text-[13px]">
            <CheckIcon className="size-4 shrink-0 text-status-ok" />
            <span className="truncate">
              Linked · <span className="font-medium">{identityLabel(link)}</span>
              {handle ? <span className="text-muted-foreground"> {handle}</span> : null}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unlink.isPending}
            onClick={() => void confirmUnlink()}
            data-testid="telegram-identity-unlink"
          >
            Unlink
          </Button>
        </div>
      ) : null}

      {!link && code ? (
        <IdentityCodePanel
          botUsername={botUsername}
          code={code}
          busy={busy}
          isFetching={links.isFetching}
          onCopy={() => void copyCommand()}
          onRefresh={() => void links.refetch()}
          onNewCode={() => issueCode.mutate()}
        />
      ) : null}

      {!link && !code ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Not linked yet. Get a code, then send it to the bot.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {botLink ? (
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                data-testid="telegram-identity-bot-link"
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Open {destination}
              </a>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={issueCode.isPending}
              onClick={() => issueCode.mutate()}
              data-testid="telegram-identity-link"
            >
              <LinkIcon data-icon="inline-start" />
              {issueCode.isPending ? 'Creating...' : 'Link Telegram'}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
