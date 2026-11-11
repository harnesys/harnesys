import type { AddonContext } from './addon-context.ts';
import type {
  AddonHandlerOf,
  HostToAddonMethods,
  NotificationMethods,
  ParamsOf,
  ResultOf,
} from './protocol/map.ts';

type HostMethodParams<M extends keyof HostToAddonMethods> = ParamsOf<HostToAddonMethods[M]>;
type HostMethodResult<M extends keyof HostToAddonMethods> = ResultOf<HostToAddonMethods[M]>;
type NotificationParams<K extends keyof NotificationMethods> = ParamsOf<NotificationMethods[K]>;

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: AddonContext,
) => unknown | Promise<unknown>;

export type RouteHandler = (
  params: Omit<HostMethodParams<'route.handle'>, '_meta'>,
  ctx: AddonContext,
) => HostMethodResult<'route.handle'> | Promise<HostMethodResult<'route.handle'>>;

export interface TriggerPair {
  start(params: HostMethodParams<'trigger.start'>, ctx: AddonContext): Promise<void> | void;
  stop(params: HostMethodParams<'trigger.stop'>, ctx: AddonContext): Promise<void> | void;
}

export type JobHandler = (
  params: Omit<HostMethodParams<'job.run'>, '_meta'>,
  ctx: AddonContext,
) => Promise<void> | void;

export interface WorkerPair {
  start(params: HostMethodParams<'worker.start'>, ctx: AddonContext): Promise<void> | void;
  stop(params: HostMethodParams<'worker.stop'>, ctx: AddonContext): Promise<void> | void;
}

export type HookHandler = (
  params: Omit<HostMethodParams<'hook.deliver'>, '_meta'>,
  ctx: AddonContext,
) => Promise<void> | void;

export interface TransportHandlers {
  send?(
    params: HostMethodParams<'transport.send'>,
    ctx: AddonContext,
  ): Promise<HostMethodResult<'transport.send'>> | HostMethodResult<'transport.send'>;
  edit?(params: HostMethodParams<'transport.edit'>, ctx: AddonContext): Promise<void> | void;
  typing?(params: HostMethodParams<'transport.typing'>, ctx: AddonContext): Promise<void> | void;
}

export interface SourceBackendHandlers {
  list(
    params: Omit<HostMethodParams<'source.list'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.list'> | Promise<HostMethodResult<'source.list'>>;
  stat(
    params: Omit<HostMethodParams<'source.stat'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.stat'> | Promise<HostMethodResult<'source.stat'>>;
  download(
    params: Omit<HostMethodParams<'source.download'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.download'> | Promise<HostMethodResult<'source.download'>>;
  upload?(
    params: Omit<HostMethodParams<'source.upload'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.upload'> | Promise<HostMethodResult<'source.upload'>>;
  mkdir?(
    params: Omit<HostMethodParams<'source.mkdir'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.mkdir'> | Promise<HostMethodResult<'source.mkdir'>>;
  remove?(
    params: Omit<HostMethodParams<'source.remove'>, '_meta'>,
    ctx: AddonContext,
  ): Promise<void> | void;
  export?(
    params: Omit<HostMethodParams<'source.export'>, '_meta'>,
    ctx: AddonContext,
  ): HostMethodResult<'source.export'> | Promise<HostMethodResult<'source.export'>>;
}

export interface LifecycleHandlers {
  upgrade?(params: HostMethodParams<'lifecycle.upgrade'>, ctx: AddonContext): Promise<void> | void;
}

export interface NotificationHandlers {
  'config.changed'?(
    params: NotificationParams<'config.changed'>,
    ctx: AddonContext,
  ): Promise<void> | void;
  'permissions.changed'?(
    params: NotificationParams<'permissions.changed'>,
    ctx: AddonContext,
  ): Promise<void> | void;
  'accounts.changed'?(
    params: NotificationParams<'accounts.changed'>,
    ctx: AddonContext,
  ): Promise<void> | void;
}

export interface AddonDefinition {
  tools?: Record<string, ToolHandler>;
  routes?: Record<string, RouteHandler>;
  triggers?: Record<string, TriggerPair>;
  jobs?: Record<string, JobHandler>;
  workers?: Record<string, WorkerPair>;
  hooks?: Record<string, HookHandler>;
  transport?: TransportHandlers;
  sources?: Record<string, SourceBackendHandlers>;
  lifecycle?: LifecycleHandlers;
  notifications?: NotificationHandlers;
}

export interface ResolvedAddonDefinition extends AddonDefinition {
  readonly handlers: string[];
}

export function deriveHandlers(definition: AddonDefinition): string[] {
  const handlers = ['ping', 'shutdown'];
  const hasKeys = (value: Record<string, unknown> | undefined): boolean =>
    value !== undefined && Object.keys(value).length > 0;
  if (hasKeys(definition.tools)) {
    handlers.push('tools.call');
  }
  if (hasKeys(definition.routes)) {
    handlers.push('route.handle');
  }
  if (hasKeys(definition.triggers)) {
    handlers.push('trigger.start', 'trigger.stop');
  }
  if (hasKeys(definition.jobs)) {
    handlers.push('job.run');
  }
  if (hasKeys(definition.workers)) {
    handlers.push('worker.start', 'worker.stop');
  }
  if (definition.transport?.send !== undefined) {
    handlers.push('transport.send');
  }
  if (definition.transport?.edit !== undefined) {
    handlers.push('transport.edit');
  }
  if (definition.transport?.typing !== undefined) {
    handlers.push('transport.typing');
  }
  if (hasKeys(definition.hooks)) {
    handlers.push('hook.deliver');
  }
  handlers.push(...sourceHandlerNames(definition.sources));
  if (definition.lifecycle?.upgrade !== undefined) {
    handlers.push('lifecycle.upgrade');
  }
  return handlers;
}

function sourceHandlerNames(sources: Record<string, SourceBackendHandlers> | undefined): string[] {
  if (sources === undefined || Object.keys(sources).length === 0) {
    return [];
  }
  const names = ['source.list', 'source.stat', 'source.download'];
  const implementations = Object.values(sources);
  const anyOp = (op: keyof SourceBackendHandlers): boolean =>
    implementations.some((backend) => backend[op] !== undefined);
  for (const op of ['upload', 'mkdir', 'remove', 'export'] as const) {
    if (anyOp(op)) {
      names.push(`source.${op}`);
    }
  }
  return names;
}

export function defineAddon(definition: AddonDefinition): ResolvedAddonDefinition {
  return { ...definition, handlers: deriveHandlers(definition) };
}

export type { AddonHandlerOf };
