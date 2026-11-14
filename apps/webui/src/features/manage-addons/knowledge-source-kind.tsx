import type { Source } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AddonSourceKind } from '@/shared/api/addon-sources';
import { accountsQuery } from '@/shared/api/apps';
import { RowChip } from '@/shared/ui/capability-rows';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { KnowledgeSourcePicker } from './knowledge-source-picker';
import { KnowledgeSourceSources } from './knowledge-source-sources';

interface KnowledgeSourceKindProps {
  orgId: string;
  addonId: string;
  kind: AddonSourceKind;
  sources: Source[];
  onChanged: () => Promise<void>;
}

export function KnowledgeSourceKind({
  orgId,
  addonId,
  kind,
  sources,
  onChanged,
}: KnowledgeSourceKindProps) {
  const [accountId, setAccountId] = useState<string | undefined>(kind.accountIds[0]);
  const accountsResult = useQuery(accountsQuery(orgId));
  const accountById = new Map(
    (accountsResult.data?.accounts ?? []).map((account) => [account.id, account]),
  );
  const accountName = (id: string): string => {
    const account = accountById.get(id);
    return account?.label || account?.externalAccountId || id;
  };
  const blocked = Boolean(kind.connection) && kind.accountIds.length === 0;
  const multiAccount = kind.accountIds.length > 1;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2"
      data-testid={`addon-source-kind-${kind.id}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{kind.title}</span>
        {multiAccount ? (
          <Select value={accountId ?? ''} onValueChange={(next) => setAccountId(next ?? undefined)}>
            <SelectTrigger size="sm" className="w-44" aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kind.accountIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {accountName(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          kind.accountIds.map((id) => (
            <span
              key={id}
              className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
              data-testid={`addon-source-kind-account-${id}`}
            >
              {accountName(id)}
            </span>
          ))
        )}
        <RowChip tone="neutral">{kind.attached} attached</RowChip>
      </div>

      {blocked ? (
        <SettingsWarnBanner
          title="Bind an account first"
          testId={`addon-source-kind-blocked-${kind.id}`}
        >
          This folder source uses the {kind.connection} connection. Bind an account before browsing.
        </SettingsWarnBanner>
      ) : (
        <KnowledgeSourcePicker
          orgId={orgId}
          addonId={addonId}
          kind={kind}
          accountId={accountId}
          onChanged={onChanged}
        />
      )}

      <KnowledgeSourceSources
        orgId={orgId}
        addonId={addonId}
        sources={sources}
        onChanged={onChanged}
      />
    </div>
  );
}
