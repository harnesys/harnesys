import { Injectable } from '@harnesys/brix';
import type { AddonErrorData } from '@harnesys/sdk';
import { AddonError, decodeMessage, encodeMessage, errorResponse, response } from '@harnesys/sdk';
import type { DispatchTarget } from '../../dispatcher/host-dispatcher.ts';
import { HostDispatcher } from '../../dispatcher/host-dispatcher.ts';
import { InstanceRegistry } from '../../supervisor/instance-registry.ts';
import type { SupervisorRequestHandler } from '../../supervisor/supervisor-deps.ts';

function errorDataOf(error: unknown): AddonErrorData {
  if (error instanceof AddonError) {
    return error.toData();
  }
  return { reason: 'internal', retryable: false, detail: String(error) };
}

function jsonRpcCodeOf(reason: string): number {
  if (reason === 'invalid_params') {
    return -32602;
  }
  if (reason === 'unsupported' || reason === 'not_found') {
    return -32601;
  }
  return -32000;
}

/**
 * Handles a JSON-RPC line coming from an addon process: dispatches it into the
 * host service registry and encodes the response line (§8.4 wiring seam).
 */
@Injectable()
export class DispatcherRequestHandler implements SupervisorRequestHandler {
  constructor(
    private readonly dispatcher: HostDispatcher,
    private readonly registry: InstanceRegistry,
  ) {}

  async handle(orgId: string, addonId: string, line: string): Promise<string | null> {
    let message: ReturnType<typeof decodeMessage>;
    try {
      message = decodeMessage(line);
    } catch {
      return null;
    }
    if (!('method' in message)) {
      return null;
    }
    const generation = this.registry.get(orgId, addonId)?.generation ?? 0;
    const target: DispatchTarget = {
      orgId,
      addonId,
      instanceId: `${orgId}/${addonId}@${generation}`,
      generation,
      correlationId: crypto.randomUUID(),
    };
    if (!('id' in message)) {
      await this.dispatcher.dispatch(target, message.method, message.params).catch(() => undefined);
      return null;
    }
    try {
      const result = await this.dispatcher.dispatch(target, message.method, message.params);
      return encodeMessage(response(message.id, result));
    } catch (error) {
      const data = errorDataOf(error);
      return encodeMessage(
        errorResponse(message.id, {
          code: jsonRpcCodeOf(data.reason),
          message: data.reason,
          data,
        }),
      );
    }
  }
}
