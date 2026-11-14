import { AddonError } from '@harnesys/sdk';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import type { BoundAccountRef } from './sinks.ts';

export const ACCOUNT_ERROR_CODES: readonly AccountErrorCode[] = [
  'invalid_credentials',
  'expired',
  'revoked',
  'insufficient_scopes',
  'not_found',
  'rate_limited',
  'denied',
  'identity_mismatch',
  'invalid_signature',
  'invalid_input',
  'session_expired',
  'provider_unavailable',
  'invalid_response',
  'unknown',
];

export function isAccountErrorCode(code: string): code is AccountErrorCode {
  return (ACCOUNT_ERROR_CODES as readonly string[]).includes(code);
}

export function resolveBoundAccountId(
  rows: BoundAccountRef[],
  accountId: string | undefined,
): string {
  if (rows.length === 0) {
    throw new AddonError('account_failed', {
      detail: 'no bound account',
      accountCode: 'not_found',
    });
  }
  if (accountId !== undefined) {
    if (!rows.some((row) => row.accountId === accountId)) {
      throw new AddonError('not_found', { detail: `account ${accountId} is not bound` });
    }
    return accountId;
  }
  if (rows.length > 1) {
    throw new AddonError('invalid_params', {
      detail: 'accountId is required when several accounts are bound',
    });
  }
  return rows[0]?.accountId ?? '';
}
