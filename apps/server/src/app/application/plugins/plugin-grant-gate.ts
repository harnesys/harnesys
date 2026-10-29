import type { AgentHook, GrantClass } from '@harnesys/contracts';
import type {
  HookBinding,
  Logger,
  McpServerSpec,
  PermissionMap,
  PluginComponent,
  PluginIr,
  UserConfigContentOptions,
} from 'harnesys';
import { resolveHookBindings, substituteUserConfig } from 'harnesys';
import type { PluginGrants } from '../../domain/plugin/plugin.ts';

export function componentGrantClass(
  component: PluginComponent,
  ir: PluginIr,
): GrantClass | undefined {
  switch (component.kind) {
    case 'skill':
    case 'command':
    case 'agent':
    case 'setting-default':
    case 'config-option':
      return 'content';
    case 'lsp-server':
    case 'monitor':
    case 'path-entry':
      return 'process';
    case 'mcp-server':
      return mcpServerClass(component);
    case 'hook':
      return hookGrantClass(component, ir);
    default:
      return undefined;
  }
}

function mcpServerClass(component: PluginComponent): GrantClass {
  const spec = component.spec as McpServerSpec;
  return spec.config.type === 'stdio' ? 'process' : 'network';
}

function hookGrantClass(component: PluginComponent, ir: PluginIr): GrantClass | undefined {
  if (!('binding' in component.spec)) {
    return undefined;
  }
  const handler = component.spec.binding.handler;
  switch (handler.type) {
    case 'prompt':
      return 'content';
    case 'command':
      return 'process';
    case 'http':
      return 'network';
    case 'mcp_tool':
      return addressedServerClass(handler.server, ir);
    default:
      return undefined;
  }
}

function addressedServerClass(server: string, ir: PluginIr): GrantClass | undefined {
  const serverId = server.split(':').at(-1) ?? '';
  for (const component of ir.components) {
    if (component.kind !== 'mcp-server' || component.status !== 'native') {
      continue;
    }
    const spec = component.spec as McpServerSpec;
    if (spec.serverId === serverId) {
      return mcpServerClass(component);
    }
  }
  return undefined;
}

export function applyGrantGating(
  ir: PluginIr,
  grants: PluginGrants,
  approvedServers: ReadonlySet<string>,
): PluginIr {
  return {
    ...ir,
    components: ir.components.map((component) => {
      if (component.status !== 'native') {
        return component;
      }
      const grantClass = componentGrantClass(component, ir);
      if (grantClass !== undefined && grants[grantClass] !== true) {
        return { ...component, status: 'blocked_by_grant' as const };
      }
      if (isUnapprovedStdioServer(component, approvedServers)) {
        return {
          ...component,
          status: 'blocked_by_grant' as const,
          inertReason: 'needs_server_approval',
        };
      }
      return component;
    }),
  };
}

function isUnapprovedStdioServer(
  component: PluginComponent,
  approvedServers: ReadonlySet<string>,
): boolean {
  if (component.kind !== 'mcp-server') {
    return false;
  }
  const spec = component.spec as McpServerSpec;
  return spec.config.type === 'stdio' && !approvedServers.has(spec.serverId);
}

const OPTION_ENV_PREFIX = 'HARNESSYS_PLUGIN_OPTION_';

export function pluginHookBindings(
  ir: PluginIr,
  userConfig: UserConfigContentOptions,
  logger?: Logger,
): HookBinding[] {
  const bindings: HookBinding[] = [];
  for (const component of ir.components) {
    if (component.kind !== 'hook' || component.status !== 'native') {
      continue;
    }
    if (!('binding' in component.spec)) {
      continue;
    }
    const resolved = resolveCommandEnv(component.spec.binding, userConfig);
    if (resolved === undefined) {
      logger?.warn(
        `[plugins] hook binding ${component.spec.binding.id} dropped: user_config unresolved`,
      );
      continue;
    }
    bindings.push(resolved);
  }
  return bindings;
}

function resolveCommandEnv(
  binding: HookBinding,
  userConfig: UserConfigContentOptions,
): HookBinding | undefined {
  const handler = binding.handler;
  if (handler.type !== 'command') {
    return binding;
  }
  const substitute = (value: string): string | undefined => {
    const result = substituteUserConfig(value, userConfig.values, userConfig.sensitiveKeys);
    return typeof result === 'string' ? result : undefined;
  };
  const command = substitute(handler.command);
  if (command === undefined) {
    return undefined;
  }
  const args = handler.args === undefined ? undefined : substituteList(handler.args, substitute);
  if (handler.args !== undefined && args === undefined) {
    return undefined;
  }
  const envEntries =
    handler.env === undefined ? undefined : substituteRecord(handler.env, substitute);
  if (handler.env !== undefined && envEntries === undefined) {
    return undefined;
  }
  const env = { ...optionEnv(userConfig), ...(envEntries ?? {}) };
  return {
    ...binding,
    handler: { ...handler, command, ...(args !== undefined ? { args } : {}), env },
  };
}

function substituteList(
  values: readonly string[],
  substitute: (value: string) => string | undefined,
): string[] | undefined {
  const out: string[] = [];
  for (const value of values) {
    const substituted = substitute(value);
    if (substituted === undefined) {
      return undefined;
    }
    out.push(substituted);
  }
  return out;
}

function substituteRecord(
  values: Record<string, string>,
  substitute: (value: string) => string | undefined,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const substituted = substitute(value);
    if (substituted === undefined) {
      return undefined;
    }
    out[key] = substituted;
  }
  return out;
}

export function optionEnv(userConfig: UserConfigContentOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(userConfig.values)) {
    env[`${OPTION_ENV_PREFIX}${key.toUpperCase()}`] = String(value);
  }
  return env;
}

export function agentHookBindings(
  agentId: string,
  hooks: AgentHook[],
  root: string,
  permissions?: PermissionMap,
): HookBinding[] {
  return resolveHookBindings(hooks, { agentId, root, permissions }).bindings;
}
