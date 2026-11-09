import type { Account, AccountStatus, App } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  accountsQuery,
  appKindsQuery,
  appsQuery,
  appsQueryKey,
  deleteAccount,
  deleteApp,
} from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { SettingsEmpty, SettingsErrorBanner, SettingsSection } from '@/shared/ui/settings-kit';
import { AccountForm } from './account-form';
import { AppForm } from './app-form';

const ACCOUNT_TONE: Record<AccountStatus, 'ok' | 'warn' | 'danger'> = {
  connected: 'ok',
  pending: 'warn',
  expired: 'danger',
  error: 'danger',
};

export function AppsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const kindsQuery = useQuery(appKindsQuery(orgId));
  const appsResult = useQuery(appsQuery(orgId));
  const accountsResult = useQuery(accountsQuery(orgId));
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
  };
  const removeApp = useMutation({
    mutationFn: (appId: string) => deleteApp(orgId, appId),
    onSuccess: refresh,
  });
  const removeAccount = useMutation({
    mutationFn: (accountId: string) => deleteAccount(orgId, accountId),
    onSuccess: refresh,
  });

  const kindSpecs = kindsQuery.data?.kinds ?? [];
  const apps = appsResult.data?.apps ?? [];
  const accounts = accountsResult.data?.accounts ?? [];
  const pending = kindsQuery.isPending || appsResult.isPending || accountsResult.isPending;
  const loadError = kindsQuery.error ?? appsResult.error ?? accountsResult.error;
  const actionError = removeApp.error ?? removeAccount.error;

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-apps-pane">
      {loadError ? (
        <SettingsErrorBanner message={loadError.message} testId="manage-apps-error" />
      ) : null}
      {actionError ? (
        <SettingsErrorBanner message={actionError.message} testId="manage-apps-action-error" />
      ) : null}
      <SettingsSection
        label="Applications"
        count={pending ? undefined : apps.length}
        description="Provider registrations shared by every add-on. Secret fields are encrypted per organization."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAdding((current) => !current)}
            data-testid="apps-add"
          >
            {adding ? 'Cancel' : 'Add application'}
          </Button>
        }
        testId="apps-section"
      >
        {adding ? (
          <AppForm orgId={orgId} kinds={kindSpecs} onDone={() => setAdding(false)} />
        ) : null}
        {apps.length === 0 ? (
          <SettingsEmpty
            title={pending ? 'Loading applications' : 'No applications yet'}
            description="Add a Google Cloud project, a GitHub App, or a Telegram MTProto app, then connect accounts to it."
            testId="apps-empty"
          />
        ) : (
          <RowList testId="apps-list">
            {apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                accounts={accounts.filter((account) => account.appId === app.id)}
                expanded={expandedId === app.id}
                deleting={removeApp.isPending}
                onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
                onDelete={() => removeApp.mutate(app.id)}
              />
            ))}
          </RowList>
        )}
      </SettingsSection>
      <SettingsSection
        label="Accounts"
        count={pending ? undefined : accounts.length}
        description="Connected identities. An add-on picks one by kind and scope set."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConnecting((current) => !current)}
            data-testid="accounts-connect"
          >
            {connecting ? 'Cancel' : 'Connect account'}
          </Button>
        }
        testId="accounts-section"
      >
        {connecting ? (
          <AccountForm orgId={orgId} apps={apps} onDone={() => setConnecting(false)} />
        ) : null}
        {accounts.length === 0 ? (
          <SettingsEmpty
            title={pending ? 'Loading accounts' : 'No accounts yet'}
            description="Connect a Google account, a GitHub installation, or a Telegram session."
            testId="accounts-empty"
          />
        ) : (
          <RowList testId="accounts-list">
            {accounts.map((account) => (
              <Row
                key={account.id}
                title={account.label}
                mono={false}
                summary={`${account.kind} · ${account.externalAccountId}`}
                chips={
                  <>
                    <RowChip tone={ACCOUNT_TONE[account.status]}>{account.status}</RowChip>
                    <RowChip>{account.scopes.length} scopes</RowChip>
                    {account.hasCredentials ? <RowChip tone="accent">credentials</RowChip> : null}
                  </>
                }
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removeAccount.isPending}
                    onClick={() => removeAccount.mutate(account.id)}
                    data-testid={`account-delete-${account.id}`}
                  >
                    Delete
                  </Button>
                }
                alwaysShowActions
                testId={`account-${account.id}`}
              />
            ))}
          </RowList>
        )}
      </SettingsSection>
    </div>
  );
}

interface AppRowProps {
  app: App;
  accounts: Account[];
  expanded: boolean;
  deleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function AppRow({ app, accounts, expanded, deleting, onToggle, onDelete }: AppRowProps) {
  return (
    <Row
      title={app.label}
      mono={false}
      summary={`${app.kind} · ${app.accountCount} accounts`}
      chips={
        <>
          <RowChip tone={app.status === 'configured' ? 'ok' : 'danger'}>{app.status}</RowChip>
          {app.secretFields.length > 0 ? (
            <RowChip tone="accent">{app.secretFields.length} secrets</RowChip>
          ) : null}
        </>
      }
      expanded={expanded}
      onToggle={onToggle}
      actions={
        <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={onDelete}>
          Delete
        </Button>
      }
      testId={`app-${app.id}`}
    >
      <div className="flex flex-col gap-1">
        {Object.entries(app.values).map(([key, value]) => (
          <RowField key={key} label={key} value={value || '—'} />
        ))}
        {app.secretFields.length > 0 ? (
          <RowField label="secrets" value={app.secretFields.join(', ')} />
        ) : null}
        <RowSection label="Accounts" count={accounts.length}>
          {accounts.length === 0 ? (
            <RowItem title="No accounts" />
          ) : (
            accounts.map((account) => (
              <RowItem
                key={account.id}
                title={account.label}
                description={`${account.kind} · ${account.status}`}
              />
            ))
          )}
        </RowSection>
      </div>
    </Row>
  );
}
