import type { AutomationStatus } from '@harnesys/contracts';

export interface AddonConnectionState {
  connected: boolean;
  label?: string;
  detail?: string;
}

export interface AddonDatabase {
  readonly path: string;
  exec(sql: string): void;
  all<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row[];
  get<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row | undefined;
  run(sql: string, params?: readonly unknown[]): void;
  insertReturning<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Row | undefined;
}

export interface AddonSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface AddonLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface AddonWorkerHandle {
  readonly id: string;
  readonly machineId: string;
  readonly signal: AbortSignal;
}

export interface AddonWorkerRegistry {
  register(id: string, run: (handle: AddonWorkerHandle) => Promise<void>): void;
  stop(id: string): Promise<void>;
}

export interface AddonAutomationRegistry {
  publish(items: AutomationUpsertInput[]): void;
}

export interface AutomationUpsertInput {
  id: string;
  kind: string;
  label: string;
  description?: string;
  status: AutomationStatus;
  threadId?: string | null;
  targetAgentId?: string | null;
  meta?: Record<string, string>;
  availableAt?: string | null;
  updatedAt?: string;
}

export interface AddonThreadCreateInput {
  agentId: string;
  title: string;
  kind?: 'chat' | 'group';
}

export interface AddonThreads {
  create(input: AddonThreadCreateInput): Promise<{ threadId: string }>;
  rename(threadId: string, title: string): Promise<void>;
}

export interface AddonRunInput {
  threadId: string;
  agentId: string;
  text: string;
  modeId?: string;
  fireId: string;
  expiresAt?: string | null;
}

export type AddonRunResult = 'fired' | 'busy' | 'failed';

export interface AddonRuns {
  dispatch(input: AddonRunInput): Promise<AddonRunResult>;
}

export interface AddonEvents {
  emit(input: { kind: string; action: 'changed' | 'removed' }): void;
}

export interface IntegrationContext {
  readonly orgId: string;
  readonly integrationId: string;
  readonly db: AddonDatabase;
  readonly secrets: AddonSecrets;
  readonly workers: AddonWorkerRegistry;
  readonly automations: AddonAutomationRegistry;
  readonly threads: AddonThreads;
  readonly runs: AddonRuns;
  readonly events: AddonEvents;
  readonly logger: AddonLogger;
}

export interface AddonRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export interface AddonResponse {
  status?: number;
  body: unknown;
}

export interface IntegrationRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  handler(ctx: IntegrationContext, request: AddonRequest): Promise<AddonResponse>;
}

export interface AutomationKindContribution {
  kind: string;
  label: string;
  description?: string;
  icon?: string;
  requiresConnection?: boolean;
}

export interface IntegrationDefinition {
  id: string;
  title: string;
  version: string;
  description?: string;
  icon?: string;
  setup?(ctx: IntegrationContext): Promise<void>;
  start?(ctx: IntegrationContext): Promise<void>;
  stop?(ctx: IntegrationContext): Promise<void>;
  connection?(ctx: IntegrationContext): Promise<AddonConnectionState>;
  automationKinds?: AutomationKindContribution[];
  routes?: IntegrationRoute[];
}
