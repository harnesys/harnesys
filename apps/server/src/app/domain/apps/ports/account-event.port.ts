import type { AccountStatus } from '../records.ts';

export type AccountEventType =
  | 'app.created'
  | 'app.updated'
  | 'app.deleted'
  | 'account.connected'
  | 'account.updated'
  | 'account.status_changed'
  | 'account.removed';

export interface AccountEvent {
  type: AccountEventType;
  orgId: string;
  appId: string | null;
  accountId: string | null;
  kind: string;
  status: AccountStatus | null;
}

export abstract class AccountEventPort {
  abstract publish(event: AccountEvent): void;
  abstract subscribe(orgId: string, handler: (event: AccountEvent) => void): () => void;
}
