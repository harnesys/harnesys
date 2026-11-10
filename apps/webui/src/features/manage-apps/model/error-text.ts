import type { AccountErrorCode } from '@harnesys/contracts';

export interface ErrorCopy {
  title: string;
  hint: string;
  action: 'reconnect' | 'retry' | 'none';
}

export const ACCOUNT_ERROR_TEXT: Record<AccountErrorCode, ErrorCopy> = {
  invalid_credentials: {
    title: 'Credentials were rejected',
    hint: 'The provider no longer accepts the saved credentials. Reconnect the account.',
    action: 'reconnect',
  },
  expired: {
    title: 'Connection expired',
    hint: 'The grant expired. Reconnect to get a new one.',
    action: 'reconnect',
  },
  revoked: {
    title: 'Access revoked',
    hint: 'Access was revoked on the provider side. Reconnect to grant it again.',
    action: 'reconnect',
  },
  insufficient_scopes: {
    title: 'Missing permissions',
    hint: 'The granted scopes do not cover this action. Reconnect and add the scopes.',
    action: 'reconnect',
  },
  not_found: {
    title: 'Not found at the provider',
    hint: 'The connected resource no longer exists. Remove this connection.',
    action: 'none',
  },
  rate_limited: {
    title: 'Provider rate limit',
    hint: 'Too many requests right now. Try again in a moment.',
    action: 'retry',
  },
  denied: {
    title: 'Access denied',
    hint: 'The provider declined the authorization request.',
    action: 'reconnect',
  },
  identity_mismatch: {
    title: 'Different account signed in',
    hint: 'The provider returned another identity. Reconnect with the intended account.',
    action: 'reconnect',
  },
  invalid_signature: {
    title: 'Signature check failed',
    hint: 'The request did not carry a valid provider signature.',
    action: 'retry',
  },
  invalid_input: {
    title: 'Invalid input',
    hint: 'Check the values and try again.',
    action: 'none',
  },
  session_expired: {
    title: 'Connection session expired',
    hint: 'The connection took too long. Start again.',
    action: 'reconnect',
  },
  provider_unavailable: {
    title: 'Provider unavailable',
    hint: 'The provider did not answer. Try again later.',
    action: 'retry',
  },
  invalid_response: {
    title: 'Unexpected provider response',
    hint: 'The provider returned data this connection cannot read.',
    action: 'retry',
  },
  unknown: {
    title: 'Connection failed',
    hint: 'An unexpected error stopped the connection. Try again.',
    action: 'retry',
  },
};

export function errorCopy(code: AccountErrorCode): ErrorCopy {
  return ACCOUNT_ERROR_TEXT[code];
}

export function cooldownCopy(sec: number): string {
  return `Try again in ${sec}s. The provider requested a cooldown.`;
}
