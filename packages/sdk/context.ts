export interface AddonLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface AddonSecretRef {
  readonly key: string;
}

export interface AddonSecrets {
  ref(key: string): AddonSecretRef;
}

export interface AddonSignal {
  readonly aborted: boolean;
}

export interface AddonRunHandle {
  readonly signal: AddonSignal;
}

export interface AddonDb {
  all<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row[];
  get<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row | undefined;
  run(sql: string, params?: readonly unknown[]): void;
}

export interface AddonEventInput {
  readonly kind: string;
  readonly action: 'changed' | 'removed';
}

export interface AddonEvents {
  emit(input: AddonEventInput): void;
}

export interface AddonThreads {
  create(input: { agentId: string; title: string }): Promise<{ threadId: string }>;
}

export interface AddonRuns {
  dispatch(input: {
    threadId: string;
    agentId: string;
    text: string;
  }): Promise<'fired' | 'busy' | 'failed'>;
}

export interface AddonConfigReader {
  read(): Record<string, unknown>;
}

export interface AddonContext {
  readonly addonId: string;
  readonly version: string;
  readonly logger: AddonLogger;
  readonly secrets: AddonSecrets;
  readonly db: AddonDb;
  readonly events: AddonEvents;
  readonly config: AddonConfigReader;
  readonly threads: AddonThreads;
  readonly runs: AddonRuns;
}
