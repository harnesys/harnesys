import type { HostServiceName, HostServiceParams, HostServiceResult } from '@harnesys/sdk';
import { protocolMap } from '@harnesys/sdk';
import type { z } from 'zod';
import type {
  HostCallContext,
  HostMethodLimits,
  HostMethodSpec,
} from '../../../domain/addons/host-service.ts';

export type ServiceHandler<M extends HostServiceName> = (
  ctx: HostCallContext,
  params: HostServiceParams<M>,
) => Promise<HostServiceResult<M>>;

export function serviceMethod<M extends HostServiceName>(
  method: M,
  limits: HostMethodLimits | undefined,
  handle: ServiceHandler<M>,
): HostMethodSpec<HostServiceParams<M>, HostServiceResult<M>> {
  const entry: unknown = protocolMap[method];
  if (
    !entry ||
    typeof entry !== 'object' ||
    (entry as { direction?: string }).direction !== 'addon-to-host'
  ) {
    throw new Error(`method ${method} is not an addon-to-host protocol method`);
  }
  const spec = entry as {
    params: z.ZodType<HostServiceParams<M>>;
    result: z.ZodType<HostServiceResult<M>>;
    permission: string | null;
  };
  return {
    name: method,
    params: spec.params,
    result: spec.result,
    permission: spec.permission,
    limits,
    handle: handle as (
      ctx: HostCallContext,
      params: HostServiceParams<M>,
    ) => Promise<HostServiceResult<M>>,
  };
}

export function namespaceOf(method: string): string {
  return method.split('.')[0] ?? method;
}
