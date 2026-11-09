import { DomainException } from '@harnesys/brix';

export class AppsException extends DomainException {
  constructor(errorCode: string, message: string, details?: unknown) {
    super(errorCode, message, details);
  }
}

export class AppNotFoundException extends AppsException {
  constructor(orgId: string, appId: string) {
    super('APP_NOT_FOUND', `App not found: ${appId}`, { orgId, appId });
  }
}

export class AccountNotFoundException extends AppsException {
  constructor(orgId: string, accountId: string) {
    super('ACCOUNT_NOT_FOUND', `Account not found: ${accountId}`, { orgId, accountId });
  }
}

export class AppKindUnknownException extends AppsException {
  constructor(kind: string) {
    super('APP_KIND_UNKNOWN', `Unknown app kind: ${kind}`, { kind });
  }
}

export class AppFieldsInvalidException extends AppsException {
  constructor(message: string, details: unknown) {
    super('APP_FIELDS_INVALID', message, details);
  }
}
