import type { Account, App, AppKindSpec } from '@harnesys/contracts';
import type { AccountRecord } from '../../domain/apps/account.ts';
import { type AppRecord, appSecretPrefix } from '../../domain/apps/app.ts';
import type { AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';

export interface AppViewInput {
  record: AppRecord;
  descriptor: AppKindDescriptor | null;
  accountCount: number;
  secretKeys: readonly string[];
}

export function appView(input: AppViewInput): App {
  const prefix = appSecretPrefix(input.record.id);
  const secretFields = (input.descriptor?.fields ?? [])
    .filter((field) => field.secret && input.secretKeys.includes(prefix + field.key))
    .map((field) => field.key);
  return {
    id: input.record.id,
    orgId: input.record.orgId,
    kind: input.record.kind,
    label: input.record.label,
    status: input.record.status,
    values: input.record.values,
    secretFields,
    accountCount: input.accountCount,
    createdAt: input.record.createdAt,
    updatedAt: input.record.updatedAt,
  };
}

export function accountView(record: AccountRecord, secretKeys: readonly string[]): Account {
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
    hasCredentials: secretKeys.includes(record.secretRef),
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
