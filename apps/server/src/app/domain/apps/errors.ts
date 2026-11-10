import { DomainException } from '@harnesys/brix';

export type AccountErrorCode =
  | 'invalid_credentials'
  | 'expired'
  | 'revoked'
  | 'insufficient_scopes'
  | 'not_found'
  | 'rate_limited'
  | 'denied'
  | 'identity_mismatch'
  | 'invalid_signature'
  | 'invalid_input'
  | 'session_expired'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'unknown';

export type FieldErrorCode = 'required' | 'pattern' | 'type' | 'option' | 'unknown';

export interface AccountHolderRef {
  holderType: string;
  holderId: string;
  label: string;
}

export interface ProviderErrorMeta {
  retryAfterSec?: number;
}

export class ProviderError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    readonly meta?: ProviderErrorMeta,
  ) {
    super(code);
    this.name = 'ProviderError';
  }
}

export function providerRetryAfterSec(error: ProviderError): number | null {
  const sec = error.meta?.retryAfterSec;
  if (typeof sec !== 'number' || !Number.isInteger(sec) || sec < 0) {
    return null;
  }
  return sec;
}

export class AppsException extends DomainException {
  constructor(
    readonly error: string,
    readonly status: number,
    message: string,
    readonly fields?: Record<string, FieldErrorCode>,
    readonly holders?: AccountHolderRef[],
  ) {
    super(error.toUpperCase().replaceAll('-', '_'), message);
    this.name = new.target.name;
  }
}

export class KindUnknownException extends AppsException {
  constructor(kind: string) {
    super('kind_unknown', 404, `Unknown kind: ${kind}`);
  }
}

export class AppNotFoundException extends AppsException {
  constructor(appId: string) {
    super('app_not_found', 404, `App not found: ${appId}`);
  }
}

export class AccountNotFoundException extends AppsException {
  constructor(accountId: string) {
    super('account_not_found', 404, `Account not found: ${accountId}`);
  }
}

export class SessionNotFoundException extends AppsException {
  constructor(sessionId: string) {
    super('session_not_found', 404, `Connect session not found: ${sessionId}`);
  }
}

export class InvalidFieldsException extends AppsException {
  constructor(fields: Record<string, FieldErrorCode>) {
    super('invalid_fields', 422, 'Invalid fields', fields);
  }
}

export class AppRequiredException extends AppsException {
  constructor() {
    super('app_required', 409, 'This account kind requires an app');
  }
}

export class AccountReferencedException extends AppsException {
  constructor(holders: AccountHolderRef[]) {
    super('account_referenced', 409, 'Account is used by another feature', undefined, holders);
  }
}

export class InsufficientScopesException extends AppsException {
  constructor(
    readonly missing: string[],
    error: 'insufficient_scopes' | AccountErrorCode = 'insufficient_scopes',
  ) {
    super(
      error === 'insufficient_scopes' ? 'insufficient_scopes' : error,
      409,
      'Insufficient scopes',
    );
  }
}

export class AccountAccessException extends AppsException {
  constructor(readonly code: AccountErrorCode) {
    super(code, 409, `Account access failed: ${code}`);
  }
}

export class IdentityMismatchException extends AppsException {
  constructor() {
    super('identity_mismatch', 409, 'Connected identity does not match the account');
  }
}

export function providerException(code: AccountErrorCode): AppsException {
  return new AppsException(code, 502, 'Provider request failed');
}
