import type { HostRequestName } from '@harnesys/sdk';

export abstract class AddonRpcPort {
  abstract request(
    orgId: string,
    addonId: string,
    method: HostRequestName,
    params: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
