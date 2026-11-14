import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
} from '@harnesys/contracts';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Card } from '@/shared/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { EndpointsHelp } from './endpoints-help.tsx';
import { AccountStatusBadge, AppStatusBadge } from './status-badge.tsx';

function RecordMenu({
  ariaLabel,
  testId,
  children,
}: {
  ariaLabel: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={ariaLabel}
            data-testid={testId}
          >
            <MoreHorizontalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AppRecordCardProps {
  app: AppView;
  kind: AppKindDescriptor | undefined;
  busy: boolean;
  onVerify: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AppRecordCard({ app, kind, busy, onVerify, onEdit, onDelete }: AppRecordCardProps) {
  return (
    <Card className="gap-3 bg-popover p-4" data-testid={`app-${app.id}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{app.label}</span>
          <AppStatusBadge status={app.status} />
          <RowChip>{kind?.label ?? app.kind}</RowChip>
          {app.lastError ? <RowChip tone="danger">{app.lastError}</RowChip> : null}
        </div>
        <RecordMenu ariaLabel={`Actions for ${app.label}`} testId={`app-menu-${app.id}`}>
          <DropdownMenuItem disabled={busy} onClick={onVerify}>
            Verify
          </DropdownMenuItem>
          {kind ? (
            <DropdownMenuItem disabled={busy} onClick={onEdit}>
              Edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy} onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </RecordMenu>
      </div>
      <EndpointsHelp endpoints={app.endpoints} />
    </Card>
  );
}

interface AccountRecordCardProps {
  account: AccountView;
  kind: AccountKindDescriptor | undefined;
  busy: boolean;
  onVerify: () => void;
  onReconnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AccountRecordCard({
  account,
  kind,
  busy,
  onVerify,
  onReconnect,
  onEdit,
  onDelete,
}: AccountRecordCardProps) {
  const scopeLabels = account.scopes.map(
    (scope) => kind?.scopes.options.find((option) => option.key === scope)?.label ?? scope,
  );
  return (
    <Card className="gap-3 bg-popover p-4" data-testid={`account-${account.id}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{account.label}</span>
          <AccountStatusBadge status={account.status} />
          {account.lastError ? <RowChip tone="danger">{account.lastError}</RowChip> : null}
          <span
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={account.externalAccountId}
          >
            {account.externalAccountId}
          </span>
        </div>
        <RecordMenu
          ariaLabel={`Actions for ${account.label}`}
          testId={`account-menu-${account.id}`}
        >
          <DropdownMenuItem disabled={busy} onClick={onVerify}>
            Verify
          </DropdownMenuItem>
          {kind ? (
            <DropdownMenuItem disabled={busy} onClick={onReconnect}>
              Reconnect
            </DropdownMenuItem>
          ) : null}
          {kind ? (
            <DropdownMenuItem disabled={busy} onClick={onEdit}>
              Edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy} onClick={onDelete}>
            Disconnect
          </DropdownMenuItem>
        </RecordMenu>
      </div>
      {scopeLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {scopeLabels.map((scope) => (
            <RowChip key={scope}>{scope}</RowChip>
          ))}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {account.expiresAt
          ? `Expires ${new Date(account.expiresAt).toLocaleString()}`
          : 'No expiry'}
        {account.verifiedAt ? ` · Verified ${new Date(account.verifiedAt).toLocaleString()}` : ''}
      </p>
    </Card>
  );
}
