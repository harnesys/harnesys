import type {
  AddonManifest,
  HostRequestName,
  JsonObject,
  L10n,
  MethodSpec,
  Violation,
} from '@harnesys/sdk';
import { protocolMap } from '@harnesys/sdk';
import type { z } from 'zod';
import type { Disposable, OwnerKey } from './owner.ts';

export interface HandlerSpec {
  readonly method: HostRequestName;
  readonly params: z.ZodType;
  readonly result: z.ZodType | null;
  readonly permission: string | null;
}

export function handlerSpec(method: HostRequestName): HandlerSpec {
  const spec: unknown = protocolMap[method];
  const typed = spec as MethodSpec<z.ZodType, z.ZodType | null, 'host-to-addon'>;
  if (typed?.direction !== 'host-to-addon') {
    throw new Error(`Protocol method is not host-to-addon: ${method}`);
  }
  return { method, params: typed.params, result: typed.result, permission: typed.permission };
}

export interface FamilyModule<D extends JsonObject = JsonObject> {
  readonly family: string;
  readonly versions: readonly number[];
  schema(v: number): z.ZodType<D>;
  crossCheck?(d: D, manifest: AddonManifest): readonly Violation[];
  readonly handlers: readonly HandlerSpec[];
  readonly permissions: readonly string[];
  readonly warnings?: readonly L10n[];
  register(owner: OwnerKey, d: D): Disposable;
}
