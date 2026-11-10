import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
  ProviderCatalogEntry,
} from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  accountsQuery,
  appsQuery,
  appsQueryKey,
  catalogQuery,
  deleteAccount,
  deleteApp,
  verifyAccount,
  verifyApp,
} from '@/shared/api/apps';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { SettingsEmpty, SettingsErrorBanner, SettingsSection } from '@/shared/ui/settings-kit';
import { buildKindIndex } from '../model/catalog.ts';
import { ConnectDialog } from './connect/connect-dialog.tsx';
import { EditAccountDialog, EditAppDialog } from './edit-dialogs.tsx';
import { ProviderCard } from './provider-card.tsx';

interface Holder {
  holderType: string;
  holderId: string;
  label: string;
}

interface ConnectTarget {
  kind: AccountKindDescriptor;
  reconnect: AccountView | null;
}

export function AppsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const catalogResult = useQuery(catalogQuery(orgId));
  const appsResult = useQuery(appsQuery(orgId));
  const accountsResult = useQuery(accountsQuery(orgId));
  const [connectTarget, setConnectTarget] = useState<ConnectTarget | null>(null);
  const [editingApp, setEditingApp] = useState<{ app: AppView; kind: AppKindDescriptor } | null>(
    null,
  );
  const [editingAccount, setEditingAccount] = useState<{
    account: AccountView;
    kind: AccountKindDescriptor;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [confirming, setConfirming] = useState<{ kind: 'app' | 'account'; id: string } | null>(
    null,
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
  const onError = (error: Error) => {
    setActionError(error.message);
    if (error instanceof ApiError) {
      const body = error.body as { holders?: Holder[] } | undefined;
      setHolders(body?.holders ?? []);
    }
  };
  const verifyAppMutation = useMutation({
    mutationFn: (appId: string) => verifyApp(orgId, appId),
    onSuccess: invalidate,
    onError,
  });
  const verifyAccountMutation = useMutation({
    mutationFn: (accountId: string) => verifyAccount(orgId, accountId),
    onSuccess: invalidate,
    onError,
  });
  const removeApp = useMutation({
    mutationFn: (appId: string) => deleteApp(orgId, appId),
    onSuccess: invalidate,
    onError,
  });
  const removeAccount = useMutation({
    mutationFn: (accountId: string) => deleteAccount(orgId, accountId),
    onSuccess: invalidate,
    onError,
  });

  const catalog = catalogResult.data;
  const apps = appsResult.data?.apps ?? [];
  const accounts = accountsResult.data?.accounts ?? [];
  const pending = catalogResult.isPending || appsResult.isPending || accountsResult.isPending;
  const loadError = catalogResult.error ?? appsResult.error ?? accountsResult.error;
  const busy =
    verifyAppMutation.isPending ||
    verifyAccountMutation.isPending ||
    removeApp.isPending ||
    removeAccount.isPending;

  if (loadError) {
    return <SettingsErrorBanner message={loadError.message} testId="manage-apps-error" />;
  }
  if (pending || !catalog) {
    return <SettingsEmpty title="Loading connections" testId="manage-apps-loading" />;
  }

  const index = buildKindIndex(catalog);
  const providers = catalog.providers.filter(
    (provider) => provider.appKinds.length + provider.accountKinds.length > 0,
  );

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-apps-pane">
      <SettingsSection
        label="Connections"
        description="Provider applications and connected accounts shared by every add-on. Secrets are encrypted per organization."
        testId="connections-section"
      >
        {actionError ? (
          <div className="flex flex-col gap-2">
            <SettingsErrorBanner message={actionError} testId="manage-apps-action-error" />
            {holders.length > 0 ? (
              <div className="rounded-md border border-border/40 px-3 py-2">
                <p className="font-medium text-xs">Still in use by</p>
                <ul className="list-disc pl-4 text-muted-foreground text-xs">
                  {holders.map((holder) => (
                    <li key={`${holder.holderType}-${holder.holderId}`}>
                      {holder.label || `${holder.holderType} ${holder.holderId}`}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-xs">
                  Disconnect those first, then delete.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        {providers.length === 0 ? (
          <SettingsEmpty
            title="No providers installed"
            description="Install an integration that registers apps and accounts."
            testId="apps-empty"
          />
        ) : (
          providers.map((provider: ProviderCatalogEntry) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              appKinds={provider.appKinds}
              accountKinds={provider.accountKinds}
              apps={apps.filter((app) => index.appKinds.get(app.kind)?.provider === provider.id)}
              accounts={accounts.filter(
                (account) => index.accountKinds.get(account.kind)?.provider === provider.id,
              )}
              busy={busy}
              onConnect={(kind, reconnect) => setConnectTarget({ kind, reconnect })}
              onEditApp={(app, kind) => setEditingApp({ app, kind })}
              onEditAccount={(account, kind) => setEditingAccount({ account, kind })}
              onVerifyApp={(appId) => {
                setActionError(null);
                verifyAppMutation.mutate(appId);
              }}
              onVerifyAccount={(accountId) => {
                setActionError(null);
                verifyAccountMutation.mutate(accountId);
              }}
              onDeleteApp={(appId) => setConfirming({ kind: 'app', id: appId })}
              onDeleteAccount={(accountId) => setConfirming({ kind: 'account', id: accountId })}
            />
          ))
        )}
      </SettingsSection>
      {connectTarget ? (
        <ConnectDialog
          orgId={orgId}
          catalog={catalog}
          kind={connectTarget.kind}
          reconnect={connectTarget.reconnect}
          onClose={() => setConnectTarget(null)}
        />
      ) : null}
      {editingApp ? (
        <EditAppDialog
          orgId={orgId}
          app={editingApp.app}
          kind={editingApp.kind}
          onClose={() => setEditingApp(null)}
        />
      ) : null}
      {editingAccount ? (
        <EditAccountDialog
          orgId={orgId}
          account={editingAccount.account}
          kind={editingAccount.kind}
          onClose={() => setEditingAccount(null)}
        />
      ) : null}
      {confirming ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setConfirming(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirming.kind === 'app' ? 'Delete application?' : 'Disconnect account?'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              This removes the saved record. Provider-side access is revoked when the provider
              supports it.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setHolders([]);
                  if (confirming.kind === 'app') {
                    removeApp.mutate(confirming.id);
                  } else {
                    removeAccount.mutate(confirming.id);
                  }
                  setConfirming(null);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void catalogResult.refetch();
            void appsResult.refetch();
            void accountsResult.refetch();
          }}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
}
