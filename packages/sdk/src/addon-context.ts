import type { CallMeta } from './protocol/meta.ts';

export type DbRow = Record<string, unknown>;
export type SqlParam = string | number | boolean | null;
export interface DbStatement {
  sql: string;
  params?: SqlParam[];
}
export interface DbWriteResult {
  changes: number;
  lastInsertRowid: string | number;
}

export interface AddonDb {
  exec(sql: string): Promise<void>;
  all(sql: string, params?: SqlParam[]): Promise<DbRow[]>;
  get(sql: string, params?: SqlParam[]): Promise<DbRow | null>;
  run(sql: string, params?: SqlParam[]): Promise<DbWriteResult>;
  batch(statements: DbStatement[]): Promise<DbWriteResult[]>;
}

export interface AddonSecrets {
  get(key: string): Promise<string | null>;
}

export interface AddonConfig {
  get(keys?: string[]): Promise<Record<string, unknown>>;
}

export type AddonLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AddonLog {
  debug(message: string, fields?: Record<string, unknown>): Promise<void>;
  info(message: string, fields?: Record<string, unknown>): Promise<void>;
  warn(message: string, fields?: Record<string, unknown>): Promise<void>;
  error(message: string, fields?: Record<string, unknown>): Promise<void>;
}

export interface AddonEvents {
  emit(name: string, payload: unknown): Promise<void>;
}

export interface AddonHttp {
  fetch(params: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    responseEncoding?: 'text' | 'base64';
    auth?: {
      connection: string;
      accountId?: string;
      scheme: 'bearer' | 'basic' | 'header';
      credentialKey?: string;
      header?: string;
    };
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string | null;
    bodyBase64?: string;
  }>;
}

export interface AddonFileStat {
  path: string;
  name: string;
  size: number;
  mediaType: string;
  modifiedAt: string;
}

export interface AddonFileChunk {
  data: string;
  eof: boolean;
  size: number;
  mediaType: string;
}

export interface AddonFileWriteResult {
  path: string;
  size: number;
}

export interface AddonFiles {
  stat(path: string): Promise<AddonFileStat>;
  read(params: { path: string; offset?: number; length?: number }): Promise<AddonFileChunk>;
  write(params: { path: string; data: string; append?: boolean }): Promise<AddonFileWriteResult>;
}

export interface AddonBindings {
  channels(
    provider?: string,
  ): Promise<Array<{ provider: string; channel: string; threadId: string; createdAt: string }>>;
}

export interface AddonAccounts {
  list(
    connection: string,
  ): Promise<
    Array<{ accountId: string; label: string; externalAccountId: string; status: string }>
  >;
  report(connection: string, code: string, accountId?: string): Promise<void>;
  access(
    connection: string,
    accountId?: string,
  ): Promise<{ credentials: unknown; expiresAt?: string }>;
}

export interface AddonRuns {
  dispatch(params: {
    threadId?: string;
    agentId?: string;
    input: string;
  }): Promise<{ runId: string }>;
  cancel(params: { threadId: string; runId: string }): Promise<{ ok: true }>;
}

export interface AddonThreads {
  create(params: { title?: string; agentId: string }): Promise<{ threadId: string }>;
}

export interface AddonTriggers {
  fire(params: {
    instanceId: string;
    runKey: string;
    text?: string;
    payload?: unknown;
  }): Promise<{ outcome: 'fired' | 'suppressed' | 'busy' | 'failed' }>;
}

export interface AddonInboundAttachment {
  name: string;
  mediaType?: string;
  path?: string;
  dataBase64?: string;
}

export interface AddonBridge {
  inbound(message: {
    channel: string;
    from?: string;
    text: string;
    payload?: unknown;
    attachments?: AddonInboundAttachment[];
  }): Promise<void>;
}

export interface AddonWorkers {
  report(workerId: string, state: 'running' | 'stopped' | 'failed', code?: string): Promise<void>;
}

export interface AddonContext {
  readonly meta: CallMeta;
  readonly signal: AbortSignal;
  readonly config: AddonConfig;
  readonly secrets: AddonSecrets;
  readonly db: AddonDb;
  readonly log: AddonLog;
  readonly events: AddonEvents;
  readonly http: AddonHttp;
  readonly files: AddonFiles;
  readonly accounts: AddonAccounts;
  readonly bindings: AddonBindings;
  readonly runs: AddonRuns;
  readonly threads: AddonThreads;
  readonly triggers: AddonTriggers;
  readonly bridge: AddonBridge;
  readonly workers: AddonWorkers;
}
