import type { AccountErrorCode } from './errors.ts';
import type { FieldSpec, FieldValue } from './field.ts';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsonObject {
  [key: string]: JsonValue;
}

export type AppStatus = 'configured' | 'invalid';
export type AccountStatus = 'connected' | 'expired' | 'error';

export interface AppRecord {
  id: string;
  orgId: string;
  kind: string;
  label: string;
  status: AppStatus;
  lastError: AccountErrorCode | null;
  values: Record<string, FieldValue>;
  secretFields: string[];
  metadata: JsonObject;
  verifiedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRecord {
  id: string;
  orgId: string;
  appId: string | null;
  kind: string;
  externalAccountId: string;
  partition: string;
  label: string;
  status: AccountStatus;
  lastError: AccountErrorCode | null;
  scopes: string[];
  expiresAt: number | null;
  config: Record<string, FieldValue>;
  secretFields: string[];
  metadata: JsonObject;
  verifiedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppUpdatePatch {
  label?: string;
  status?: AppStatus;
  lastError?: AccountErrorCode | null;
  values?: Record<string, FieldValue>;
  secretFields?: string[];
  metadata?: JsonObject;
  verifiedAt?: number | null;
  updatedAt?: string;
}

export interface AccountUpdatePatch {
  appId?: string | null;
  label?: string;
  status?: AccountStatus;
  lastError?: AccountErrorCode | null;
  scopes?: string[];
  expiresAt?: number | null;
  config?: Record<string, FieldValue>;
  secretFields?: string[];
  metadata?: JsonObject;
  verifiedAt?: number | null;
  updatedAt?: string;
}

export interface AppEndpoints {
  redirectUri?: string;
  webhookUrl?: string;
}

export interface AccountEndpoints {
  webhookUrl?: string;
}

export interface AppView {
  id: string;
  kind: string;
  label: string;
  status: AppStatus;
  lastError: AccountErrorCode | null;
  values: Record<string, FieldValue>;
  secretFields: string[];
  endpoints: AppEndpoints;
  verifiedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountView {
  id: string;
  appId: string | null;
  kind: string;
  externalAccountId: string;
  partition: string;
  label: string;
  status: AccountStatus;
  lastError: AccountErrorCode | null;
  scopes: string[];
  expiresAt: number | null;
  config: Record<string, FieldValue>;
  secretFields: string[];
  endpoints: AccountEndpoints;
  verifiedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ConnectTarget = 'app' | 'account';
export type ConnectSessionStatus = 'pending' | 'completed' | 'failed';

export interface ConnectSessionResult {
  target: ConnectTarget;
  id: string;
}

export interface ConnectSession {
  id: string;
  state: string;
  orgId: string;
  principalId: string;
  target: ConnectTarget;
  kind: string;
  appId: string | null;
  accountId: string | null;
  inputs: Record<string, FieldValue>;
  scopes: string[];
  providerState: JsonObject;
  status: ConnectSessionStatus;
  result: ConnectSessionResult | null;
  error: AccountErrorCode | null;
  retryAfterSec: number | null;
  launchToken: string | null;
  launchHtml: string | null;
  launchFormHosts: string[];
  launchFormFields: FieldSpec[];
  launchUsed: boolean;
  stateUsed: boolean;
  resumeCount: number;
  createdAt: number;
  expiresAt: number;
}
