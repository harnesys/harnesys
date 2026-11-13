import type { AccountView } from '@harnesys/contracts';
import { XIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';

export function shortId(accountId: string): string {
  return accountId.length > 12 ? `${accountId.slice(0, 12)}...` : accountId;
}

export function accountTitle(account: AccountView | undefined, accountId: string): string {
  if (!account) {
    return shortId(accountId);
  }
  return account.label || account.externalAccountId || shortId(accountId);
}

export function formatStamp(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export function AccountCard({
  account,
  accountId,
  kindLabel,
  installed,
  busy,
  onUnbind,
}: {
  account: AccountView | undefined;
  accountId: string;
  kindLabel: string | undefined;
  installed: boolean;
  busy: boolean;
  onUnbind: () => void;
}) {
  const title = accountTitle(account, accountId);
  const expires = account ? formatStamp(account.expiresAt) : null;
  const verified = account ? formatStamp(account.verifiedAt) : null;
  const added = account ? new Date(account.createdAt).toLocaleDateString() : null;
  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2.5"
      data-testid={`addon-binding-${accountId}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback className="text-[11px]">{title.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-4">{title}</p>
          {account && account.label !== account.externalAccountId ? (
            <p className="wrap-anywhere font-mono text-[11px] text-muted-foreground leading-3">
              {account.externalAccountId}
            </p>
          ) : null}
        </div>
        {account ? (
          <RowChip tone={account.status === 'connected' ? 'ok' : 'danger'}>
            {account.status}
          </RowChip>
        ) : (
          <RowChip tone="warn">missing</RowChip>
        )}
        {installed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Unbind ${title}`}
            disabled={busy}
            onClick={onUnbind}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      {account ? (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {kindLabel ? <RowChip tone="info">{kindLabel}</RowChip> : null}
            {account.scopes.map((scope) => (
              <RowChip key={scope} testId={`addon-binding-scope-${scope}`}>
                {scope}
              </RowChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {account.lastError ? (
              <span className="text-destructive" data-testid="addon-binding-error">
                {account.lastError}
              </span>
            ) : null}
            {expires ? <span>Token expires {expires}</span> : null}
            {verified ? <span>Verified {verified}</span> : null}
            {added ? <span>Added {added}</span> : null}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          This account no longer exists in Apps. Unbind it, or connect a replacement with "Add
          account".
        </p>
      )}
    </div>
  );
}
