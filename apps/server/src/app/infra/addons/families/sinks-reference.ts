import type { TransportMessage } from '@harnesys/sdk';

export type TriggerFireOutcome = 'fired' | 'suppressed' | 'busy' | 'failed';

export interface TriggerFireInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  runKey: string;
  text?: string;
}

export interface TriggerFireSink {
  fire(input: TriggerFireInput): Promise<TriggerFireOutcome>;
}

export interface BridgeInboundInput {
  orgId: string;
  addonId: string;
  message: TransportMessage;
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
