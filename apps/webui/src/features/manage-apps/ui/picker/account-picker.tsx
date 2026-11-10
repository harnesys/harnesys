import type { AccountView, CatalogResponse } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountsQuery, catalogQuery } from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
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
  const [creating, setCreating] = useState(false);
  const catalogResult = useQuery(catalogQuery(orgId));
  const accountsResult = useQuery(accountsQuery(orgId));
  const accounts = accountsResult.data?.accounts ?? [];
  const catalog: CatalogResponse | undefined = catalogResult.data;
  const kind = catalog
    ? catalog.providers
        .flatMap((provider) => provider.accountKinds)
        .find((entry) => entry.kind === kinds[0])
    : undefined;

  const usable = (account: AccountView) =>
    account.status === 'connected' &&
    kinds.includes(account.kind) &&
    scopes.every((scope) => account.scopes.includes(scope));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        data-testid="account-picker"
      >
        <option value="">No account</option>
        {accounts.map((account) => {
          const eligible = usable(account);
          const reason = account.status !== 'connected' ? account.status : 'missing scopes or kind';
          return (
            <option key={account.id} value={account.id} disabled={!eligible}>
              {account.label}
              {eligible ? '' : ` — ${reason}`}
            </option>
          );
        })}
      </select>
      {allowCreate && kind ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
          Connect new
        </Button>
      ) : null}
      {creating && catalog && kind ? (
        <ConnectDialog
          orgId={orgId}
          catalog={catalog}
          kind={kind}
          reconnect={null}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
