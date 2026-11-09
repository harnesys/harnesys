import type { AccountRecord, AccountStatus } from '../../domain/apps/account.ts';
import type { AppRecord } from '../../domain/apps/app.ts';
import type { AppAccountRow, AppRow } from '../org-sqlite/schema/index.ts';

export function toApp(row: AppRow): AppRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    label: row.label,
    status: row.status === 'invalid' ? 'invalid' : 'configured',
    values: parseValues(row.configJson),
    secretFields: parseSecretFields(row.secretFieldsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAccount(row: AppAccountRow): AccountRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    appId: row.appId,
    kind: row.kind,
    externalAccountId: row.externalAccountId,
    label: row.label,
    status: accountStatus(row.status),
    scopes: parseStringList(row.scopesJson),
    scopeKey: row.scopeKey,
    values: parseValues(row.valuesJson),
    secretFields: parseSecretFields(row.secretFieldsJson),
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function accountStatus(raw: string): AccountStatus {
  if (raw === 'connected' || raw === 'expired' || raw === 'error' || raw === 'pending') {
    return raw;
  }
  return 'pending';
}

function parseValues(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseObject(raw))) {
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}

function parseSecretFields(raw: string): string[] {
  return [...new Set(parseStringList(raw))].sort();
}

function parseStringList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    return [];
  }
  return [];
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
