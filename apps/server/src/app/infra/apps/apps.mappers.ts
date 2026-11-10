import { isAccountErrorCode } from '../../application/apps/access/status-map.ts';
import type { AccountErrorCode } from '../../domain/apps/errors.ts';
import type { FieldValue } from '../../domain/apps/field.ts';
import type {
  AccountRecord,
  AccountStatus,
  AppRecord,
  AppStatus,
  JsonObject,
} from '../../domain/apps/records.ts';
import type { AppAccountRow, AppRow } from '../org-sqlite/schema/index.ts';

export function toApp(row: AppRow): AppRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    label: row.label,
    status: row.status === 'invalid' ? 'invalid' : 'configured',
    lastError: errorCode(row.lastError),
    values: parseFieldValues(row.valuesJson),
    secretFields: parseStringList(row.secretFieldsJson),
    metadata: parseJsonObject(row.metadataJson),
    verifiedAt: row.verifiedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAccount(row: AppAccountRow): AccountRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    appId: row.appId ?? null,
    kind: row.kind,
    externalAccountId: row.externalAccountId,
    partition: row.partition,
    label: row.label,
    status: accountStatus(row.status),
    lastError: errorCode(row.lastError),
    scopes: parseStringList(row.scopesJson),
    expiresAt: row.expiresAt ?? null,
    config: parseFieldValues(row.configJson),
    secretFields: parseStringList(row.secretFieldsJson),
    metadata: parseJsonObject(row.metadataJson),
    verifiedAt: row.verifiedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function accountStatus(raw: string): AccountStatus {
  if (raw === 'expired' || raw === 'error') {
    return raw;
  }
  return 'connected';
}

export function parseStringList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [
        ...new Set(parsed.filter((entry): entry is string => typeof entry === 'string')),
      ].sort();
    }
  } catch {
    return [];
  }
  return [];
}

export function parseFieldValues(raw: string): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(parseJsonObject(raw))) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    }
  }
  return output;
}

export function parseJsonObject(raw: string | null): JsonObject {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    return {};
  }
  return {};
}

export function errorCode(raw: string | null): AccountErrorCode | null {
  if (raw === null) {
    return null;
  }
  return isAccountErrorCode(raw) ? raw : 'unknown';
}

export function appStatus(raw: string): AppStatus {
  return raw === 'invalid' ? 'invalid' : 'configured';
}
