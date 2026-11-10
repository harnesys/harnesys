import type { JsonObject, RouteHandleResult, RouteRequest, TransportMessage } from '@harnesys/sdk';

export interface AddonCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  principal?: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string;
  threadId?: string;
  runId?: string;
}

export interface ToolCallParams {
  pack: string;
  tool: string;
  input: JsonObject;
}

export interface ToolCallResult {
  output: unknown;
}

export interface RouteCallParams {
  routeId: string;
  request: RouteRequest;
}

export interface TriggerStartParams {
  instanceId: string;
  kind: string;
  config: JsonObject;
  target?: unknown;
}

export interface HookDeliverParams {
  hookId: string;
  event: JsonObject;
}

export abstract class AddonCallPort {
  abstract callTool(
    orgId: string,
    addonId: string,
    params: ToolCallParams,
    opts?: AddonCallOptions,
  ): Promise<ToolCallResult>;

  abstract callRoute(
    orgId: string,
    addonId: string,
    params: RouteCallParams,
    opts?: AddonCallOptions,
  ): Promise<RouteHandleResult>;

  abstract triggerStart(
    orgId: string,
    addonId: string,
    params: TriggerStartParams,
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract triggerStop(
    orgId: string,
    addonId: string,
    params: { instanceId: string },
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract jobRun(
    orgId: string,
    addonId: string,
    params: { jobId: string },
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract workerStart(
    orgId: string,
    addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract workerStop(
    orgId: string,
    addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract hookDeliver(
    orgId: string,
    addonId: string,
    params: HookDeliverParams,
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract transportSend(
    orgId: string,
    addonId: string,
    message: TransportMessage,
    opts?: AddonCallOptions,
  ): Promise<{ messageId?: string }>;

  abstract transportEdit(
    orgId: string,
    addonId: string,
    params: { messageId: string; message: TransportMessage },
    opts?: AddonCallOptions,
  ): Promise<void>;

  abstract transportTyping(
    orgId: string,
    addonId: string,
    params: { channel: string; on: boolean },
    opts?: AddonCallOptions,
  ): Promise<void>;
}
