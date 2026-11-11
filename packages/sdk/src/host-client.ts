import { type AddonContext, createAddonContext } from './addon-context-factory.ts';
import { type HostServiceClient, methodSpec, protocolEntries } from './protocol/map.ts';
import { type CallMeta, CallMetaSchema } from './protocol/meta.ts';

export interface HostChannel {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
  notify(method: string, params: unknown): void;
}

export function createHostClient(channel: HostChannel, getMeta: () => CallMeta): HostServiceClient {
  const client = {} as Record<
    string,
    (params: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>
  >;
  for (const entry of protocolEntries()) {
    if (entry.spec.direction !== 'addon-to-host') {
      continue;
    }
    client[entry.method] = async (params: unknown, options?: { signal?: AbortSignal }) => {
      const spec = methodSpec(entry.method);
      if (!spec) {
        throw new Error(`method '${entry.method}' is not in the protocol map`);
      }
      const parsedParams = spec.params.parse({
        ...(params as Record<string, unknown>),
        _meta: getMeta(),
      });
      const raw = await channel.request(entry.method, parsedParams, options?.signal);
      return spec.result ? spec.result.parse(raw) : raw;
    };
  }
  return client as HostServiceClient;
}

export function parseCallMeta(raw: unknown): CallMeta {
  return CallMetaSchema.parse(raw);
}

export function createAddonContextFor(
  channel: HostChannel,
  meta: CallMeta,
  signal: AbortSignal,
): AddonContext {
  return createAddonContext(
    createHostClient(channel, () => meta),
    meta,
    signal,
    (method, params) => channel.notify(method, params),
  );
}

export type { AddonContext } from './addon-context.ts';
