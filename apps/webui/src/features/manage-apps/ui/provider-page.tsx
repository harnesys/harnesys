import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
} from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindowIcon, ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
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
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { SettingsEmpty, SettingsErrorBanner, SettingsSection } from '@/shared/ui/settings-kit';
import { buildKindIndex } from '../model/catalog.ts';
import { ConnectDialog } from './connect/connect-dialog.tsx';
import { EditAccountDialog, EditAppDialog } from './edit-dialogs.tsx';
import { ConnectAction, ProviderHero } from './provider-hero.tsx';
import { AccountRecordCard, AppRecordCard } from './record-cards.tsx';

interface Holder {
  holderType: string;
  holderId: string;
  label: string;
}

interface ConnectTarget {
  kind: AccountKindDescriptor;
  reconnect: AccountView | null;
}

export function AppProviderPage() {
  const { orgId, providerId } = useParams();
  const navigate = useNavigate();
  if (!orgId || !providerId) {
    return <Navigate to="/" replace />;
  }
  return <ProviderPage orgId={orgId} providerId={providerId} navigate={navigate} />;
}

function ProviderPage({
  orgId,
  providerId,
  navigate,
}: {
  orgId: string;
  providerId: string;
  navigate: (path: string) => void;
}) {
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

  const backPath = studioPath.settings(orgId, 'apps');
  const catalog = catalogResult.data;
  const loadError = catalogResult.error ?? appsResult.error ?? accountsResult.error;
  const busy =
    verifyAppMutation.isPending ||
    verifyAccountMutation.isPending ||
    removeApp.isPending ||
    removeAccount.isPending;
  const provider = catalog?.providers.find((item) => item.id === providerId);

  if (catalogResult.isPending || !catalog) {
    return (
      <ProviderShell navigate={navigate} backPath={backPath}>
        <p className="px-6 py-8 text-muted-foreground text-sm">Loading provider...</p>
      </ProviderShell>
    );
  }
  if (loadError) {
    return (
      <ProviderShell navigate={navigate} backPath={backPath}>
        <div className="px-6 py-8">
          <SettingsErrorBanner message={loadError.message} testId="manage-apps-error" />
        </div>
      </ProviderShell>
    );
  }
  if (!provider) {
    return <Navigate to={backPath} replace />;
  }

  const index = buildKindIndex(catalog);
  const apps = (appsResult.data?.apps ?? []).filter(
    (app) => index.appKinds.get(app.kind)?.provider === provider.id,
  );
  const accounts = (accountsResult.data?.accounts ?? []).filter(
    (account) => index.accountKinds.get(account.kind)?.provider === provider.id,
  );
  const appKindById = new Map(provider.appKinds.map((kind) => [kind.kind, kind]));
  const accountKindById = new Map(provider.accountKinds.map((kind) => [kind.kind, kind]));

  return (
    <ProviderShell navigate={navigate} backPath={backPath}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
        <ProviderHero provider={provider} apps={apps.length} accounts={accounts.length} />
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
        <SettingsSection label="Applications" count={apps.length} testId="apps-applications">
          {apps.length === 0 ? (
            <SettingsEmpty
              title="No applications"
              description="An account that needs an application creates or picks one while connecting."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {apps.map((app) => (
                <AppRecordCard
                  key={app.id}
                  app={app}
                  kind={appKindById.get(app.kind)}
                  busy={busy}
                  onVerify={() => {
                    setActionError(null);
                    verifyAppMutation.mutate(app.id);
                  }}
                  onEdit={() => {
                    const kind = appKindById.get(app.kind);
                    if (kind) {
                      setEditingApp({ app, kind });
                    }
                  }}
                  onDelete={() => setConfirming({ kind: 'app', id: app.id })}
                />
              ))}
            </div>
          )}
        </SettingsSection>
        <SettingsSection
          label="Accounts"
          count={accounts.length}
          testId="apps-accounts"
          actions={
            <ConnectAction
              kinds={provider.accountKinds}
              busy={busy}
              onPick={(kind) => setConnectTarget({ kind, reconnect: null })}
            />
          }
        >
          {accounts.length === 0 ? (
            <SettingsEmpty
              title="No accounts"
              description="Connect an account to let add-ons act on this provider."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map((account) => (
                <AccountRecordCard
                  key={account.id}
                  account={account}
                  kind={accountKindById.get(account.kind)}
                  busy={busy}
                  onVerify={() => {
                    setActionError(null);
                    verifyAccountMutation.mutate(account.id);
                  }}
                  onReconnect={() => {
                    const kind = accountKindById.get(account.kind);
                    if (kind) {
                      setConnectTarget({ kind, reconnect: account });
                    }
                  }}
                  onEdit={() => {
                    const kind = accountKindById.get(account.kind);
                    if (kind) {
                      setEditingAccount({ account, kind });
                    }
                  }}
                  onDelete={() => setConfirming({ kind: 'account', id: account.id })}
                />
              ))}
            </div>
          )}
        </SettingsSection>
      </div>
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
        <ConfirmDeleteDialog
          kind={confirming.kind}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setActionError(null);
            setHolders([]);
            if (confirming.kind === 'app') {
              removeApp.mutate(confirming.id);
            } else {
              removeAccount.mutate(confirming.id);
            }
            setConfirming(null);
          }}
        />
      ) : null}
    </ProviderShell>
  );
}

function ProviderShell({
  navigate,
  backPath,
  children,
}: {
  navigate: (path: string) => void;
  backPath: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background"
      data-testid="app-provider-page"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => navigate(backPath)}
          data-testid="app-provider-back"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to settings
        </Button>
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <AppWindowIcon className="size-4" />
          Apps
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function ConfirmDeleteDialog({
  kind,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: 'app' | 'account';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === 'app' ? 'Delete application?' : 'Disconnect account?'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          This removes the saved record. Provider-side access is revoked when the provider supports
          it.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
