import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import type { AccountStatus } from '../../../domain/apps/records.ts';

export const ACCOUNT_STATUS_BY_ERROR: Record<AccountErrorCode, AccountStatus | null> = {
  invalid_credentials: 'expired',
  expired: 'expired',
  revoked: 'expired',
  insufficient_scopes: 'expired',
  rate_limited: 'error',
  provider_unavailable: 'error',
  invalid_response: 'error',
  not_found: 'error',
  unknown: 'error',
  identity_mismatch: 'error',
  denied: null,
  invalid_signature: null,
  invalid_input: null,
  session_expired: null,
};

export function statusForError(code: AccountErrorCode): AccountStatus | null {
  return ACCOUNT_STATUS_BY_ERROR[code];
}

export function isAccountErrorCode(raw: string): raw is AccountErrorCode {
  return Object.hasOwn(ACCOUNT_STATUS_BY_ERROR, raw);
}
