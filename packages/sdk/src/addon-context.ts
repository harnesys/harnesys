import type { CallMeta } from './protocol/meta.ts';
import type { AppCredentials } from './protocol/shared.ts';

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
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
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
      scheme: 'bearer' | 'basic' | 'header' | 'path';
      credentialKey?: string;
      header?: string;
      placeholder?: string;
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
  bind(params: { provider: string; channel: string; threadId: string }): Promise<{ ok: true }>;
  unbind(params: { provider: string; channel: string }): Promise<{ ok: true }>;
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
  ): Promise<{ credentials: unknown; expiresAt?: string; app?: AppCredentials | null }>;
}

export interface AddonRuns {
  dispatch(params: {
    threadId?: string;
    agentId?: string;
    input: string;
  }): Promise<{ runId: string }>;
  cancel(params: { threadId: string; runId: string }): Promise<{ ok: true }>;
  list(params: {
    threadId: string;
    status?: string;
  }): Promise<
    Array<{ runId: string; status: string; startedAt: string | null; agentId: string | null }>
  >;
}

export interface AddonThreadView {
  threadId: string;
  kind: string;
  title: string;
  responderMode: 'auto' | 'mention';
  autoReplyAgentId: string | null;
  agents: Array<{ id: string; name: string }>;
}

export interface AddonThreads {
  create(params: {
    title?: string;
    agentId: string;
    kind?: 'chat' | 'group';
    responderMode?: 'auto' | 'mention';
  }): Promise<{ threadId: string }>;
  get(params: { threadId: string }): Promise<AddonThreadView | null>;
  patch(params: { threadId: string; responderMode?: 'auto' | 'mention' }): Promise<void>;
  compact(params: { threadId: string }): Promise<
    | {
        compacted: true;
        id: string;
        coveredFrom: number;
        coveredUntil: number;
        tokensBefore: number;
        tokensAfter: number;
      }
    | { compacted: false; reason?: string }
  >;
}

export interface AddonAgentView {
  id: string;
  name: string;
  status?: string;
}

export interface AddonAgents {
  list(): Promise<AddonAgentView[]>;
}

export interface AddonUsage {
  summary(params: { threadId?: string; since?: string }): Promise<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    byModel: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
  }>;
}

export interface AddonSkills {
  list(params: {
    threadId?: string;
  }): Promise<Array<{ id: string; name: string; description: string | null; source: string }>>;
}

export interface AddonTriggerTarget {
  threadId: string;
  agentId: string;
  modeId?: string;
}

export interface AddonTriggerField {
  label: string;
  value: string;
  href?: string;
}

export interface AddonTriggers {
  fire(params: {
    instanceId: string;
    runKey: string;
    text?: string;
    title?: string;
    fields?: AddonTriggerField[];
    payload?: unknown;
  }): Promise<{ outcome: 'fired' | 'suppressed' | 'busy' | 'failed'; runId?: string | null }>;
  create(params: {
    kind: string;
    label: string;
    config: Record<string, unknown>;
    target: AddonTriggerTarget;
    instructions?: string;
  }): Promise<{ instanceId: string }>;
  update(params: {
    instanceId: string;
    label?: string;
    config?: Record<string, unknown>;
    target?: AddonTriggerTarget;
    instructions?: string;
    enabled?: boolean;
  }): Promise<{ instanceId: string }>;
}

export interface AddonOrg {
  settings(): Promise<{ timezone: string }>;
}

export interface AddonApprovals {
  request(params: {
    interruptId: string;
    agentId: string;
    threadId?: string;
    kind: 'tool' | 'spend' | 'memory' | 'question' | 'file_access';
    question: string;
    options: Array<'approve' | 'approve_once' | 'deny' | 'block_path' | 'close'>;
    context: {
      source: string;
      ops?: string[];
      tool?: {
        name: string;
        inputPreview?: string;
        command?: string;
        truncated?: boolean;
      };
      note?: string;
    };
  }): Promise<{ id: string }>;
}

export interface AddonInboundAttachment {
  name: string;
  mediaType?: string;
  path?: string;
  dataBase64?: string;
}

export interface AddonProgress {
  progress(token: string, value: unknown): void;
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

export interface AddonWorkerLease {
  held: boolean;
  epoch: number;
  expiresAt: string | null;
}

export interface AddonWorkers {
  report(workerId: string, state: 'running' | 'stopped' | 'failed', code?: string): Promise<void>;
  lease(workerId: string, ttlMs?: number): Promise<AddonWorkerLease>;
  release(workerId: string): Promise<void>;
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
  readonly agents: AddonAgents;
  readonly usage: AddonUsage;
  readonly skills: AddonSkills;
  readonly triggers: AddonTriggers;
  readonly bridge: AddonBridge;
  readonly workers: AddonWorkers;
  readonly org: AddonOrg;
  readonly approvals: AddonApprovals;
  readonly progress: AddonProgress;
}
