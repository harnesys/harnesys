import type { HostRequestName } from '@harnesys/sdk';

export interface AddonRpcCallMeta {
  principal?: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string;
  threadId?: string;
  runId?: string;
}

export interface AddonRpcCall {
  orgId: string;
  addonId: string;
  method: HostRequestName;
  params: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  meta?: AddonRpcCallMeta;
}

export abstract class AddonRpcPort {
  abstract request(call: AddonRpcCall): Promise<unknown>;
}
