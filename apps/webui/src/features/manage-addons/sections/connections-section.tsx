import type { AccountKindDescriptor, AccountView, AddonConnectionView } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { ConnectDialog } from '@/features/manage-apps';
import { orgAddonDetailQueryKey, putOrgAddonBindings } from '@/shared/api/addons';
import { accountsQuery, accountsQueryKey, catalogQuery } from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import type { SectionProps } from '../lib/section-props';
import { AccountCard, accountTitle } from './account-card';

interface ConnectionTarget {
  connection: AddonConnectionView;
  kinds: AccountKindDescriptor[];
  candidates: AccountView[];
}

export function ConnectionsSection({ orgId, detail, section, installed }: SectionProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [connectKind, setConnectKind] = useState<AccountKindDescriptor | null>(null);
  const accountsResult = useQuery(accountsQuery(orgId));
  const catalogResult = useQuery(catalogQuery(orgId));
  const accounts = accountsResult.data?.accounts ?? [];
  const catalog = catalogResult.data;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const kindById = new Map(
    (catalog?.providers ?? [])
      .flatMap((provider) => provider.accountKinds)
      .map((kind) => [kind.kind, kind]),
  );

  const onlyConnections = Array.isArray(section.connections)
    ? (section.connections as string[])
    : undefined;
  const connections = onlyConnections
    ? detail.connections.filter((connection) => onlyConnections.includes(connection.connectionId))
    : detail.connections;
  const boundIds = new Set(connections.flatMap((connection) => connection.accountIds));
  const targets: ConnectionTarget[] = connections.map((connection) => ({
    connection,
    kinds: connection.accountKinds.flatMap((kind) => kindById.get(kind) ?? []),
    candidates: accounts.filter(
      (account) =>
        account.status === 'connected' &&
        connection.accountKinds.includes(account.kind) &&
        !boundIds.has(account.id),
    ),
  }));

  const saveBinding = async (connection: AddonConnectionView, accountIds: string[]) => {
    setPendingId(connection.connectionId);
    setError(null);
    try {
      await putOrgAddonBindings(orgId, detail.addonId, connection.connectionId, accountIds);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  const bind = (connection: AddonConnectionView, accountId: string) => {
    void saveBinding(
      connection,
      connection.cardinality === 'one'
        ? [accountId]
        : [...connection.accountIds, accountId].filter((id) => id !== accountId),
    );
  };

  if (connections.length === 0) {
    return null;
  }

  return (
    <RowSection
      label="Connections"
      count={connections.length}
      actions={
        installed ? (
          <AddAccountMenu targets={targets} onPick={bind} onCreate={setConnectKind} />
        ) : undefined
      }
    >
      {error ? <SettingsErrorBanner message={error} testId="addon-connections-error" /> : null}
      {connections.map((connection, index) => (
        <div
          key={connection.connectionId}
          className={
            index === 0
              ? 'flex min-w-0 flex-col gap-1.5'
              : 'mt-1 flex min-w-0 flex-col gap-1.5 border-t pt-2'
          }
          data-testid={`addon-connection-${connection.connectionId}`}
        >
          <div className="flex min-w-0 items-center gap-2 px-1">
            <span className="min-w-0 flex-1 truncate font-medium text-sm">{connection.label}</span>
            {connection.needsSetup ? <RowChip tone="danger">needs setup</RowChip> : null}
            {connection.optional ? <RowChip>optional</RowChip> : null}
            <RowChip>{connection.cardinality === 'one' ? 'single' : 'multi'}</RowChip>
          </div>
          {connection.accountIds.length === 0 ? (
            <RowItem
              title={installed ? 'No accounts bound' : 'Enable the add-on to bind accounts'}
              description={
                installed
                  ? 'Use "Add account" to bind an existing account or connect a new one.'
                  : undefined
              }
            />
          ) : (
            connection.accountIds.map((accountId) => {
              const account = accountById.get(accountId);
              return (
                <AccountCard
                  key={accountId}
                  account={account}
                  accountId={accountId}
                  kindLabel={
                    account ? (kindById.get(account.kind)?.label ?? account.kind) : undefined
                  }
                  installed={installed}
                  busy={pendingId === connection.connectionId}
                  onUnbind={() =>
                    void saveBinding(
                      connection,
                      connection.accountIds.filter((id) => id !== accountId),
                    )
                  }
                />
              );
            })
          )}
        </div>
      ))}
      {connectKind && catalog ? (
        <ConnectDialog
          orgId={orgId}
          catalog={catalog}
          kind={connectKind}
          reconnect={null}
          onClose={() => {
            setConnectKind(null);
            void queryClient.invalidateQueries({ queryKey: accountsQueryKey(orgId) });
            void queryClient.invalidateQueries({
              queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
            });
          }}
        />
      ) : null}
    </RowSection>
  );
}

function AddAccountMenu({
  targets,
  onPick,
  onCreate,
}: {
  targets: ConnectionTarget[];
  onPick: (connection: AddonConnectionView, accountId: string) => void;
  onCreate: (kind: AccountKindDescriptor) => void;
}) {
  const grouped = targets.length > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="addon-connection-add"
          />
        }
      >
        <PlusIcon />
        Add account
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {targets.map((target, index) => (
          <TargetGroup
            key={target.connection.connectionId}
            target={target}
            grouped={grouped}
            first={index === 0}
            onPick={onPick}
            onCreate={onCreate}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TargetGroup({
  target,
  grouped,
  first,
  onPick,
  onCreate,
}: {
  target: ConnectionTarget;
  grouped: boolean;
  first: boolean;
  onPick: (connection: AddonConnectionView, accountId: string) => void;
  onCreate: (kind: AccountKindDescriptor) => void;
}) {
  const { connection, kinds, candidates } = target;
  return (
    <>
      {!first ? <DropdownMenuSeparator /> : null}
      {grouped ? <DropdownMenuLabel>{connection.label}</DropdownMenuLabel> : null}
      {candidates.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">No unbound connected accounts</p>
      ) : (
        candidates.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onClick={() => onPick(connection, account.id)}
            data-testid={`addon-connection-pick-${account.id}`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm">{accountTitle(account, account.id)}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {account.scopes.length > 0 ? account.scopes.join(' · ') : 'no scopes'}
              </span>
            </div>
          </DropdownMenuItem>
        ))
      )}
      <CreateAccountEntry kinds={kinds} onCreate={onCreate} hasCandidates={candidates.length > 0} />
    </>
  );
}

function CreateAccountEntry({
  kinds,
  onCreate,
  hasCandidates,
}: {
  kinds: AccountKindDescriptor[];
  onCreate: (kind: AccountKindDescriptor) => void;
  hasCandidates: boolean;
}) {
  if (kinds.length === 0) {
    return null;
  }
  if (kinds.length === 1) {
    return (
      <>
        {hasCandidates ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={() => onCreate(kinds[0])} data-testid="addon-connection-create">
          Connect new {kinds[0].label}...
        </DropdownMenuItem>
      </>
    );
  }
  return (
    <>
      {hasCandidates ? <DropdownMenuSeparator /> : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Connect new...</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {kinds.map((kind) => (
            <DropdownMenuItem key={kind.kind} onClick={() => onCreate(kind)}>
              {kind.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
