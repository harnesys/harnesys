import { z } from 'zod';
import { EffectivePermissionSchema } from '../permissions/permissions.ts';
import { CancelNotificationSchema, ProgressNotificationSchema } from './envelope.ts';
import { InitializeParamsSchema, InitializeResultSchema } from './handshake.ts';
import { CallMetaSchema } from './meta.ts';
import {
  AccountSummarySchema,
  DbRowSchema,
  HttpFetchParamsSchema,
  HttpFetchResultSchema,
  InboundMessageSchema,
  LogWriteParamsSchema,
  RouteHandleResultSchema,
  RouteRequestSchema,
  SqlParamSchema,
  TransportMessageSchema,
  TriggerFireOutcomeSchema,
} from './shared.ts';

export type MethodDirection = 'host-to-addon' | 'addon-to-host' | 'notification';
export type NotificationSender = 'host' | 'addon' | 'both';

export interface MethodSpec<
  SParams extends z.ZodType,
  SResult extends z.ZodType | null,
  D extends MethodDirection = MethodDirection,
> {
  readonly direction: D;
  readonly params: SParams;
  readonly result: SResult;
  readonly permission: string | null;
  readonly sender?: NotificationSender;
}

export function hostMethod<SParams extends z.ZodType, SResult extends z.ZodType>(
  params: SParams,
  result: SResult,
  permission: string | null = null,
): MethodSpec<SParams, SResult, 'host-to-addon'> {
  return { direction: 'host-to-addon', params, result, permission };
}

export function addonMethod<SParams extends z.ZodType, SResult extends z.ZodType>(
  params: SParams,
  result: SResult,
  permission: string | null,
): MethodSpec<SParams, SResult, 'addon-to-host'> {
  return { direction: 'addon-to-host', params, result, permission };
}

export function notificationSpec<SParams extends z.ZodType>(
  params: SParams,
  sender: NotificationSender,
  permission: string | null = null,
): MethodSpec<SParams, null, 'notification'> {
  return { direction: 'notification', params, result: null, permission, sender };
}

const empty = z.object({});
const str = z.string().min(1);

export const protocolMap = {
  initialize: hostMethod(InitializeParamsSchema, InitializeResultSchema),
  initialized: notificationSpec(empty, 'host'),
  shutdown: hostMethod(
    z
      .object({ reason: z.string().min(1), deadlineMs: z.number().int().positive() })
      .extend({ _meta: CallMetaSchema }),
    empty,
  ),
  ping: hostMethod(empty, empty),
  'config.changed': notificationSpec(z.object({ keys: z.array(z.string()) }), 'host'),
  'permissions.changed': notificationSpec(
    z.object({ permissions: z.array(EffectivePermissionSchema) }),
    'host',
  ),
  'accounts.changed': notificationSpec(
    z.object({ connection: str, accountId: str, status: z.string() }),
    'host',
  ),
  'lifecycle.upgrade': hostMethod(
    z.object({ fromVersion: str }).extend({ _meta: CallMetaSchema }),
    empty,
  ),
  'tools.call': hostMethod(
    z
      .object({ pack: str, tool: str, input: z.record(z.string(), z.unknown()).default({}) })
      .extend({ _meta: CallMetaSchema }),
    z.object({ output: z.unknown() }),
  ),
  'route.handle': hostMethod(
    z.object({ routeId: str, request: RouteRequestSchema }).extend({ _meta: CallMetaSchema }),
    RouteHandleResultSchema,
  ),
  'trigger.start': hostMethod(
    z
      .object({
        instanceId: str,
        kind: str,
        config: z.record(z.string(), z.unknown()),
        target: z.unknown().optional(),
      })
      .extend({ _meta: CallMetaSchema }),
    empty,
    'trigger',
  ),
  'trigger.stop': hostMethod(
    z.object({ instanceId: str }).extend({ _meta: CallMetaSchema }),
    empty,
    'trigger',
  ),
  'job.run': hostMethod(z.object({ jobId: str }).extend({ _meta: CallMetaSchema }), empty),
  'worker.start': hostMethod(z.object({ workerId: str }).extend({ _meta: CallMetaSchema }), empty),
  'worker.stop': hostMethod(z.object({ workerId: str }).extend({ _meta: CallMetaSchema }), empty),
  'transport.send': hostMethod(
    z.object({ message: TransportMessageSchema }).extend({ _meta: CallMetaSchema }),
    z.object({ messageId: str.optional() }),
  ),
  'transport.edit': hostMethod(
    z.object({ messageId: str, message: TransportMessageSchema }).extend({ _meta: CallMetaSchema }),
    empty,
  ),
  'transport.typing': hostMethod(
    z.object({ channel: str, on: z.boolean() }).extend({ _meta: CallMetaSchema }),
    empty,
  ),
  'hook.deliver': hostMethod(
    z
      .object({ hookId: str, event: z.record(z.string(), z.unknown()) })
      .extend({ _meta: CallMetaSchema }),
    empty,
  ),
  'config.get': addonMethod(
    z.object({ keys: z.array(z.string()).optional() }),
    z.object({ values: z.record(z.string(), z.unknown()) }),
    null,
  ),
  'secrets.get': addonMethod(
    z.object({ key: str }),
    z.object({ value: z.string().nullable() }),
    null,
  ),
  'db.exec': addonMethod(z.object({ sql: str }), empty, null),
  'db.all': addonMethod(
    z.object({ sql: str, params: z.array(SqlParamSchema).optional() }),
    z.object({ rows: z.array(DbRowSchema) }),
    null,
  ),
  'db.get': addonMethod(
    z.object({ sql: str, params: z.array(SqlParamSchema).optional() }),
    z.object({ row: DbRowSchema.nullable() }),
    null,
  ),
  'db.run': addonMethod(
    z.object({ sql: str, params: z.array(SqlParamSchema).optional() }),
    z.object({
      changes: z.number().int().nonnegative(),
      lastInsertRowid: z.union([z.string(), z.number()]),
    }),
    null,
  ),
  'db.batch': addonMethod(
    z.object({
      statements: z
        .array(z.object({ sql: str, params: z.array(SqlParamSchema).optional() }))
        .max(100),
    }),
    z.object({
      results: z.array(
        z.object({
          changes: z.number().int().nonnegative(),
          lastInsertRowid: z.union([z.string(), z.number()]),
        }),
      ),
    }),
    null,
  ),
  'log.write': addonMethod(LogWriteParamsSchema, empty, null),
  'events.emit': addonMethod(z.object({ name: str, payload: z.unknown() }), empty, null),
  'http.fetch': addonMethod(HttpFetchParamsSchema, HttpFetchResultSchema, 'http.fetch'),
  'accounts.list': addonMethod(
    z.object({ connection: str }),
    z.object({ accounts: z.array(AccountSummarySchema) }),
    'accounts.use',
  ),
  'accounts.report': addonMethod(
    z.object({ connection: str, accountId: str.optional(), code: str }),
    empty,
    'accounts.use',
  ),
  'accounts.access': addonMethod(
    z.object({ connection: str, accountId: str.optional() }),
    z.object({ credentials: z.unknown(), expiresAt: str.optional() }),
    'accounts.credentials',
  ),
  'runs.dispatch': addonMethod(
    z.object({ threadId: str.optional(), agentId: str.optional(), input: str }),
    z.object({ runId: str }),
    'runs.dispatch',
  ),
  'threads.create': addonMethod(
    z.object({ title: str.optional(), agentId: z.string().uuid() }),
    z.object({ threadId: str }),
    'threads.create',
  ),
  'triggers.fire': addonMethod(
    z.object({
      instanceId: str,
      runKey: str,
      text: str.optional(),
      payload: z.unknown().optional(),
    }),
    z.object({ outcome: TriggerFireOutcomeSchema }),
    'trigger',
  ),
  'bridge.inbound': addonMethod(
    z.object({ message: InboundMessageSchema }),
    empty,
    'bridge.inbound',
  ),
  'workers.report': addonMethod(
    z.object({
      workerId: str,
      state: z.enum(['running', 'stopped', 'failed']),
      code: str.optional(),
    }),
    empty,
    'worker',
  ),
  '$/cancel': notificationSpec(CancelNotificationSchema, 'both'),
  '$/progress': notificationSpec(ProgressNotificationSchema, 'addon'),
};

export type ProtocolMethodMap = typeof protocolMap;
export const PROTOCOL_METHODS = Object.keys(protocolMap);

export type ParamsOf<S> = S extends { readonly params: infer SParams }
  ? SParams extends z.ZodType
    ? z.output<SParams>
    : never
  : never;
export type ResultOf<S> = S extends { readonly result: infer SResult }
  ? SResult extends null
    ? undefined
    : SResult extends z.ZodType
      ? z.output<SResult>
      : never
  : never;
export type DirectionOf<S> = S extends { readonly direction: infer D } ? D : never;

export type MethodsOf<D extends MethodDirection> = {
  [K in keyof ProtocolMethodMap as DirectionOf<ProtocolMethodMap[K]> extends D
    ? K
    : never]: ProtocolMethodMap[K];
};

export type HostToAddonMethods = MethodsOf<'host-to-addon'>;
export type AddonToHostMethods = MethodsOf<'addon-to-host'>;
export type NotificationMethods = MethodsOf<'notification'>;

export type HostRequestName = keyof HostToAddonMethods;
export type HostServiceName = keyof AddonToHostMethods;
export type NotificationName = keyof NotificationMethods;

export type HostRequestParams<M extends HostRequestName> = ParamsOf<HostToAddonMethods[M]>;
export type HostRequestResult<M extends HostRequestName> = ResultOf<HostToAddonMethods[M]>;
export type HostServiceParams<M extends HostServiceName> = ParamsOf<AddonToHostMethods[M]>;
export type HostServiceResult<M extends HostServiceName> = ResultOf<AddonToHostMethods[M]>;

export type AddonDispatcher = {
  [K in keyof HostToAddonMethods]: (
    params: ParamsOf<HostToAddonMethods[K]>,
  ) => Promise<ResultOf<HostToAddonMethods[K]>>;
};

export type HostServiceClient = {
  [K in keyof AddonToHostMethods]: (
    params: Omit<ParamsOf<AddonToHostMethods[K]>, '_meta'>,
    options?: { signal?: AbortSignal },
  ) => Promise<ResultOf<AddonToHostMethods[K]>>;
};

export type AddonHandlerOf<S, Ctx> = S extends { readonly params: infer SParams }
  ? SParams extends z.ZodType
    ? (params: z.output<SParams>, ctx: Ctx) => ResultOf<S> | Promise<ResultOf<S>>
    : never
  : never;

export type HostNotify = {
  [K in keyof NotificationMethods as NotificationMethods[K] extends { sender: infer S }
    ? S extends 'host' | 'both'
      ? K
      : never
    : never]: (params: ParamsOf<NotificationMethods[K]>) => void;
};

export type AddonNotify = {
  [K in keyof NotificationMethods as NotificationMethods[K] extends { sender: infer S }
    ? S extends 'addon' | 'both'
      ? K
      : never
    : never]: (params: ParamsOf<NotificationMethods[K]>) => void;
};

export function stripMeta<P extends { _meta?: unknown }>(params: P): Omit<P, '_meta'> {
  const copy = { ...params };
  delete copy._meta;
  return copy;
}

export interface ProtocolEntry {
  method: string;
  spec: MethodSpec<z.ZodType, z.ZodType | null, MethodDirection>;
}

export function protocolEntries(): ProtocolEntry[] {
  return Object.entries(protocolMap).map(([method, spec]) => ({ method, spec }) as ProtocolEntry);
}

export function methodSpec(
  method: string,
): MethodSpec<z.ZodType, z.ZodType | null, MethodDirection> | undefined {
  const spec: unknown = protocolMap[method as keyof ProtocolMethodMap];
  return spec as MethodSpec<z.ZodType, z.ZodType | null, MethodDirection> | undefined;
}
