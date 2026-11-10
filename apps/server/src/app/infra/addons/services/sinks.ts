import type { InboundMessageSchema, TriggerFireOutcomeSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { HostCallContext } from '../../../domain/addons/host-service.ts';

export type SqlParam = string | number | boolean | null;
export type DbRow = Record<string, unknown>;
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type TriggerFireOutcome = z.infer<typeof TriggerFireOutcomeSchema>;

export interface DbRunResult {
  changes: number;
  lastInsertRowid: string | number;
}

export interface DbStatement {
  sql: string;
  params?: SqlParam[];
}

export abstract class AddonDbAccess {
  abstract exec(orgId: string, addonId: string, sql: string): Promise<void>;
  abstract all(orgId: string, addonId: string, sql: string, params?: SqlParam[]): Promise<DbRow[]>;
  abstract get(
    orgId: string,
    addonId: string,
    sql: string,
    params?: SqlParam[],
  ): Promise<DbRow | null>;
  abstract run(
    orgId: string,
    addonId: string,
    sql: string,
    params?: SqlParam[],
  ): Promise<DbRunResult>;
  abstract batch(orgId: string, addonId: string, statements: DbStatement[]): Promise<DbRunResult[]>;
}

export abstract class AddonSecrets {
  abstract get(orgId: string, addonId: string, key: string): Promise<string | null>;
}

export type LogLevelValue = 'debug' | 'info' | 'warn' | 'error';

export interface AddonLogEntry {
  orgId: string;
  addonId: string;
  level: LogLevelValue;
  message: string;
  fields?: Record<string, unknown>;
  at: string;
}

export abstract class LogSink {
  abstract append(entry: AddonLogEntry): void;

  /**
   * Unified raw stderr-line entry point (AddonLogSink shape): every addon
   * stderr line and supervisor note goes through `write`, persisted as an
   * info-level entry.
   */
  write(orgId: string, addonId: string, line: string): void {
    this.append({
      orgId,
      addonId,
      level: 'info',
      message: line,
      at: new Date().toISOString(),
    });
  }
}

export interface BoundAccountRef {
  accountId: string;
}

export abstract class BindingsReader {
  abstract accountsFor(orgId: string, addonId: string, connectionId: string): BoundAccountRef[];
}

export interface TriggerFireInput {
  instanceId: string;
  runKey: string;
  text?: string;
  payload?: unknown;
}

export abstract class TriggerFireSink {
  abstract fire(ctx: HostCallContext, input: TriggerFireInput): Promise<TriggerFireOutcome>;
}

export abstract class BridgeInboundSink {
  abstract inbound(ctx: HostCallContext, message: InboundMessage): Promise<void>;
}

export interface WorkerReportInput {
  workerId: string;
  state: 'running' | 'stopped' | 'failed';
  code?: string;
}

export abstract class WorkerReportSink {
  abstract report(ctx: HostCallContext, input: WorkerReportInput): Promise<void>;
}
