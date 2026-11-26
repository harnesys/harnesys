import { type AddonContext, createAddonContext } from './addon-context-factory.ts';
import { AddonError } from './protocol/error.ts';
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
      const parsedParams = spec.params.safeParse(params);
      if (!parsedParams.success) {
        throw new AddonError('invalid_params', {
          detail: `${entry.method}: ${issuesText(parsedParams.error.issues)}`,
        });
      }
      const raw = await channel.request(
        entry.method,
        { ...(parsedParams.data as Record<string, unknown>), _meta: getMeta() },
        options?.signal,
      );
      if (!spec.result) {
        return raw;
      }
      const parsedResult = spec.result.safeParse(raw);
      if (!parsedResult.success) {
        throw new AddonError('invalid_response', {
          detail: `${entry.method}: ${issuesText(parsedResult.error.issues)}`,
        });
      }
      return parsedResult.data;
    };
  }
  return client as HostServiceClient;
}

function issuesText(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
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
