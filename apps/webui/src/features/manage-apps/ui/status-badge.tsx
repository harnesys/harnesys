import type { AccountStatus, AppStatus } from '@harnesys/contracts';
import { RowChip } from '@/shared/ui/capability-rows';

const APP_TONE: Record<AppStatus, 'ok' | 'danger'> = {
  configured: 'ok',
  invalid: 'danger',
};

const ACCOUNT_TONE: Record<AccountStatus, 'ok' | 'warn' | 'danger'> = {
  connected: 'ok',
  expired: 'warn',
  error: 'danger',
};

export function AppStatusBadge({ status }: { status: AppStatus }) {
  return <RowChip tone={APP_TONE[status]}>{status}</RowChip>;
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <RowChip tone={ACCOUNT_TONE[status]}>{status}</RowChip>;
}
