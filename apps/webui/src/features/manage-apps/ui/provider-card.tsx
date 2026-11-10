import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
  ProviderCatalogEntry,
} from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SettingsEmpty, SettingsSection } from '@/shared/ui/settings-kit';
import { EndpointsHelp } from './endpoints-help.tsx';
import { AccountStatusBadge, AppStatusBadge } from './status-badge.tsx';

export function ProviderCard({
  provider,
  appKinds,
  accountKinds,
  apps,
  accounts,
  busy,
  onConnect,
  onEditApp,
  onEditAccount,
  onVerifyApp,
  onVerifyAccount,
  onDeleteApp,
  onDeleteAccount,
}: {
  provider: ProviderCatalogEntry;
  appKinds: AppKindDescriptor[];
  accountKinds: AccountKindDescriptor[];
  apps: AppView[];
  accounts: AccountView[];
  busy: boolean;
  onConnect: (kind: AccountKindDescriptor, reconnect: AccountView | null) => void;
  onEditApp: (app: AppView, kind: AppKindDescriptor) => void;
  onEditAccount: (account: AccountView, kind: AccountKindDescriptor) => void;
  onVerifyApp: (appId: string) => void;
  onVerifyAccount: (accountId: string) => void;
  onDeleteApp: (appId: string) => void;
  onDeleteAccount: (accountId: string) => void;
}) {
  const appKindById = new Map(appKinds.map((kind) => [kind.kind, kind]));
  const accountKindById = new Map(accountKinds.map((kind) => [kind.kind, kind]));
  const soleKind = accountKinds.length === 1 ? accountKinds[0] : undefined;
  let connectAction: ReactNode;
  if (soleKind) {
    connectAction = (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          onConnect(soleKind, null);
        }}
      >
        Connect
      </Button>
    );
  } else if (accountKinds.length > 1) {
    connectAction = (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" size="sm" variant="outline" disabled={busy} />}
        >
          Connect
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {accountKinds.map((kind) => (
            <DropdownMenuItem key={kind.kind} onClick={() => onConnect(kind, null)}>
              {kind.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <SettingsSection
      label={provider.label}
      count={apps.length + accounts.length}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {provider.description}
          {provider.docsUrl ? (
            <a
              className="underline underline-offset-2"
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
          ) : null}
        </span>
      }
      actions={connectAction}
      testId={`provider-${provider.id}`}
    >
      {provider.iconSvg ? (
        <img
          alt=""
          className="size-6"
          src={`data:image/svg+xml,${encodeURIComponent(provider.iconSvg)}`}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Applications
        </p>
        {apps.length === 0 ? (
          <SettingsEmpty
            title="No applications"
            description="An account that needs an application creates or picks one while connecting."
          />
        ) : (
          <RowList>
            {apps.map((app) => {
              const kind = appKindById.get(app.kind);
              return (
                <div
                  key={app.id}
                  className="flex flex-col gap-1 px-1 py-2"
                  data-testid={`app-${app.id}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-sm">{app.label}</span>
                    <AppStatusBadge status={app.status} />
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                      {kind?.label ?? app.kind}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onVerifyApp(app.id)}
                      >
                        Verify
                      </Button>
                      {kind ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onEditApp(app, kind)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onDeleteApp(app.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <EndpointsHelp endpoints={app.endpoints} />
                </div>
              );
            })}
          </RowList>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Accounts
        </p>
        {accounts.length === 0 ? (
          <SettingsEmpty
            title="No accounts"
            description="Connect an account to let add-ons act on this provider."
          />
        ) : (
          <RowList>
            {accounts.map((account) => {
              const kind = accountKindById.get(account.kind);
              return (
                <div
                  key={account.id}
                  className="flex flex-col gap-1 px-1 py-2"
                  data-testid={`account-${account.id}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-sm">{account.label}</span>
                    <AccountStatusBadge status={account.status} />
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {account.externalAccountId}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onVerifyAccount(account.id)}
                      >
                        Verify
                      </Button>
                      {kind ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onConnect(kind, account)}
                          >
                            Reconnect
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onEditAccount(account, kind)}
                          >
                            Edit
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onDeleteAccount(account.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {account.scopes.length === 0 ? (
                      <span className="text-muted-foreground text-xs">No scopes</span>
                    ) : (
                      account.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-muted px-1 font-mono text-[10px]"
                          title={scope}
                        >
                          {kind?.scopes.options.find((option) => option.key === scope)?.label ??
                            scope}
                        </span>
                      ))
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {account.expiresAt
                      ? `Expires ${new Date(account.expiresAt).toLocaleString()}`
                      : 'No expiry'}
                    {account.verifiedAt
                      ? ` · Verified ${new Date(account.verifiedAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
              );
            })}
          </RowList>
        )}
      </div>
    </SettingsSection>
  );
}
