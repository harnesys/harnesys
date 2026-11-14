import type { AccountKindDescriptor, AccountView, CatalogResponse } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountsQuery, catalogQuery } from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ConnectDialog } from '../connect/connect-dialog.tsx';

interface AccountPickerProps {
  orgId: string;
  kinds: string[];
  scopes?: string[];
  value: string | null;
  onChange: (accountId: string | null) => void;
  allowCreate?: boolean;
}

export function AccountPicker({
  orgId,
  kinds,
  scopes = [],
  value,
  onChange,
  allowCreate = true,
}: AccountPickerProps) {
  const [creatingKind, setCreatingKind] = useState<AccountKindDescriptor | null>(null);
  const catalogResult = useQuery(catalogQuery(orgId));
  const catalog: CatalogResponse | undefined = catalogResult.data;
  const singleKind = kinds.length === 1;
  const accountsResult = useQuery(
    singleKind ? accountsQuery(orgId, { kind: kinds[0] }) : accountsQuery(orgId),
  );
  const accounts = accountsResult.data?.accounts ?? [];
  const kindOptions = catalog
    ? catalog.providers
        .flatMap((provider) => provider.accountKinds)
        .filter((entry) => kinds.includes(entry.kind))
    : [];
  const soleKind = kindOptions.length === 1 ? kindOptions[0] : undefined;

  const usable = (account: AccountView) =>
    account.status === 'connected' &&
    kinds.includes(account.kind) &&
    scopes.every((scope) => account.scopes.includes(scope));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select
        value={value ?? null}
        onValueChange={(next) => onChange(typeof next === 'string' && next !== '' ? next : null)}
      >
        <SelectTrigger size="sm" className="min-w-0 flex-1" data-testid="account-picker">
          <SelectValue placeholder="No account" />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-(--select-width) max-w-72">
          {accounts.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-xs">No connected accounts</p>
          ) : null}
          {accounts.map((account) => {
            const eligible = usable(account);
            const reason =
              account.status !== 'connected' ? account.status : 'missing scopes or kind';
            return (
              <SelectItem key={account.id} value={account.id} disabled={!eligible}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{account.label}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {account.scopes.length > 0 ? account.scopes.join(' · ') : 'no scopes'}
                    {eligible ? '' : ` — ${reason}`}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {allowCreate && soleKind ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setCreatingKind(soleKind)}>
          Connect new
        </Button>
      ) : null}
      {allowCreate && kindOptions.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" />}>
            Connect new
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {kindOptions.map((kind) => (
              <DropdownMenuItem key={kind.kind} onClick={() => setCreatingKind(kind)}>
                {kind.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {creatingKind && catalog ? (
        <ConnectDialog
          orgId={orgId}
          catalog={catalog}
          kind={creatingKind}
          reconnect={null}
          onClose={() => setCreatingKind(null)}
        />
      ) : null}
    </div>
  );
}
