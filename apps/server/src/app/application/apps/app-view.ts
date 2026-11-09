import type { Account, AccountKindSpec, App, AppKindSpec } from '@harnesys/contracts';
import type { AccountRecord } from '../../domain/apps/account.ts';
import type { AppRecord } from '../../domain/apps/app.ts';
import type { AccountKindDescriptor, AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';

export interface AppViewInput {
  record: AppRecord;
  descriptor: AppKindDescriptor | null;
  accountCount: number;
}

export function appView(input: AppViewInput): App {
  return {
    id: input.record.id,
    orgId: input.record.orgId,
    kind: input.record.kind,
    label: input.record.label,
    status: input.record.status,
    values: input.record.values,
    secretFields: input.record.secretFields,
    accountCount: input.accountCount,
    createdAt: input.record.createdAt,
    updatedAt: input.record.updatedAt,
  };
}

export function accountView(record: AccountRecord): Account {
  return {
    id: record.id,
    orgId: record.orgId,
    appId: record.appId,
    kind: record.kind,
    externalAccountId: record.externalAccountId,
    label: record.label,
    status: record.status,
    scopes: record.scopes,
    scopeKey: record.scopeKey,
    values: record.values,
    secretFields: record.secretFields,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function appKindView(descriptor: AppKindDescriptor): AppKindSpec {
  return {
    kind: descriptor.kind,
    label: descriptor.label,
    description: descriptor.description,
    fields: descriptor.fields.map((field) => ({
      key: field.key,
      label: field.label,
      secret: field.secret,
      required: field.required,
      multiline: field.multiline,
      placeholder: field.placeholder,
    })),
  };
}

export function accountKindView(descriptor: AccountKindDescriptor): AccountKindSpec {
  return {
    kind: descriptor.kind,
    label: descriptor.label,
    description: descriptor.description,
    fields: descriptor.fields.map((field) => ({
      key: field.key,
      label: field.label,
      secret: field.secret,
      required: field.required,
      multiline: field.multiline,
      placeholder: field.placeholder,
    })),
  };
}
