import type { TransportMessage } from '@harnesys/sdk';
import type { ResolvedInboundAttachment } from '../bridge/inbound-attachment.resolver.ts';

export interface TriggerFireOutcome {
  outcome: 'fired' | 'suppressed' | 'busy' | 'failed';
  runId?: string | null;
}

export interface TriggerFireInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  runKey: string;
  text?: string;
  payload?: unknown;
}

export interface TriggerFireSink {
  fire(input: TriggerFireInput): Promise<TriggerFireOutcome>;
}

export interface BridgeInboundInput {
  orgId: string;
  addonId: string;
  message: TransportMessage;
  attachments?: ResolvedInboundAttachment[];
}

export interface BridgeInboundSink {
  inbound(input: BridgeInboundInput): Promise<void>;
}

export type WorkerReportState = 'running' | 'stopped' | 'failed';

export interface WorkerReportInput {
  orgId: string;
  addonId: string;
  workerId: string;
  state: WorkerReportState;
  code?: string;
}

export interface WorkerReportSink {
  report(input: WorkerReportInput): Promise<void>;
}

export interface AccountsChangedEvent {
  connection: string;
  accountId: string;
  status: string;
}

export interface AccountsChangedSink {
  accountsChanged(orgId: string, addonId: string, event: AccountsChangedEvent): Promise<void>;
}
