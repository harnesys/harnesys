import type { CapabilityScope } from '../../domain/pack.ts';
import type { McpManagePort, McpServerEntry } from '../../ports/mcp-manage.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runGuard } from '../agents/run-guard.ts';

export interface CreateMcpToolsParams {
  mcp: McpManagePort;
  resolveScope: () => CapabilityScope;
}

const SERVER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

interface McpConnectInput {
  serverId?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
  url?: unknown;
  type?: unknown;
  headers?: unknown;
  enabled?: unknown;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function recordOf(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      out[key] = item;
    }
  }
  return out;
}

function collectEntry(input: McpConnectInput): { entry: McpServerEntry } | { error: string } {
  if (typeof input.serverId !== 'string' || !SERVER_ID_RE.test(input.serverId)) {
    return { error: 'serverId must match [a-zA-Z0-9][a-zA-Z0-9_-]*' };
  }
  return input.command !== undefined ? collectStdioEntry(input) : collectUrlEntry(input);
}

function collectStdioEntry(input: McpConnectInput): { entry: McpServerEntry } | { error: string } {
  const command = stringOf(input.command);
  if (command === undefined) {
    return { error: 'either command (stdio) or url (http/sse) is required' };
  }
  const args = Array.isArray(input.args)
    ? input.args.filter((item): item is string => typeof item === 'string')
    : undefined;
  const env = recordOf(input.env);
  const enabled = input.enabled !== false;
  return {
    entry: {
      command,
      ...(args !== undefined && args.length > 0 ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(!enabled ? { enabled: false } : {}),
    },
  };
}

function collectUrlEntry(input: McpConnectInput): { entry: McpServerEntry } | { error: string } {
  const url = stringOf(input.url);
  if (url === undefined) {
    return { error: 'either command (stdio) or url (http/sse) is required' };
  }
  const type = transportTypeOf(input.type);
  const headers = recordOf(input.headers);
  const enabled = input.enabled !== false;
  return {
    entry: {
      url,
      ...(type !== undefined ? { type } : {}),
      ...(headers !== undefined ? { headers } : {}),
      ...(!enabled ? { enabled: false } : {}),
    },
  };
}

function transportTypeOf(value: unknown): 'sse' | 'http' | undefined {
  if (value === 'sse' || value === 'http') {
    return value;
  }
  return undefined;
}

async function applyConnect(
  deps: CreateMcpToolsParams,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const input = (raw ?? {}) as McpConnectInput;
  const collected = collectEntry(input);
  if ('error' in collected) {
    return { error: collected.error };
  }
  const serverId = input.serverId as string;
  const health = await deps.mcp.upsert(deps.resolveScope(), serverId, collected.entry);
  return health.connected
    ? {
        serverId,
        connected: true,
        toolCount: health.tools.length,
        tools: health.tools,
        note:
          'Stored at ORG level (all agents can be granted it); this run does not get the tools. ' +
          'To use them yourself: agents_update { agentId: <your id>, mcpServers: [.., "' +
          serverId +
          '"] }, ' +
          'then in your next message load_tools(["' +
          serverId +
          '__<toolName>"]) and call the tools.',
      }
    : { serverId, connected: false, error: health.error ?? 'server did not connect' };
}

async function applyCheck(
  deps: CreateMcpToolsParams,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const serverId = stringOf((raw as { serverId?: unknown })?.serverId);
  if (serverId === undefined) {
    return { error: 'serverId must be a non-empty string' };
  }
  const health = await deps.mcp.health(deps.resolveScope(), serverId);
  return { ...health };
}

async function applyToggle(
  deps: CreateMcpToolsParams,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const input = (raw ?? {}) as { serverId?: unknown; enabled?: unknown };
  const serverId = stringOf(input.serverId);
  if (serverId === undefined) {
    return { error: 'serverId must be a non-empty string' };
  }
  if (typeof input.enabled !== 'boolean') {
    return { error: 'enabled must be a boolean' };
  }
  const health = await deps.mcp.setEnabled(deps.resolveScope(), serverId, input.enabled);
  return { ...health, enabled: input.enabled };
}

async function applyRemove(
  deps: CreateMcpToolsParams,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const serverId = stringOf((raw as { serverId?: unknown })?.serverId);
  if (serverId === undefined) {
    return { error: 'serverId must be a non-empty string' };
  }
  await deps.mcp.remove(deps.resolveScope(), serverId);
  return { removed: serverId };
}

async function applyList(deps: CreateMcpToolsParams): Promise<Record<string, unknown>> {
  const servers = await deps.mcp.list(deps.resolveScope());
  return {
    servers,
    note: 'managed=true entries come from the org mcp config and can be edited with mcp_connect/mcp_toggle/mcp_remove. Grant servers to an agent via agents_update mcpServers.',
  };
}

const SERVER_ID_PROPERTY = {
  type: 'string',
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$',
  description: 'Server id used in tool prefixes and the org mcp config',
} as const;

export function createMcpTools(deps: CreateMcpToolsParams): ToolDefinition[] {
  return [
    tool('mcp_list', {
      group: 'mcp',
      operations: ['mcp_manage'],
      sideEffect: 'read',
      description:
        'List MCP servers of this org: config entry (transport, command/url, enabled), live connection status and their tools. ' +
        'Read-only.',
      input: { type: 'object', properties: {} },
      execute: () => runGuard(() => applyList(deps)),
    }),
    tool('mcp_connect', {
      group: 'mcp',
      operations: ['mcp_manage'],
      sideEffect: 'write',
      description:
        'Install (or replace) an MCP server at ORG level: stored in the org config, verified with a live probe. ' +
        'Pass command (+args/env/cwd) for a stdio server or url (+type sse|http, headers) for a remote one. ' +
        'A broken entry is rejected and nothing is stored. Returns { serverId, connected, tools }. ' +
        'Org install alone gives you nothing: grant the server to an agent (yourself included) via agents_update mcpServers, ' +
        'then load_tools in your next message. ' +
        'Discover servers with your regular web search (e.g. "modelcontextprotocol servers").',
      input: {
        type: 'object',
        properties: {
          serverId: SERVER_ID_PROPERTY,
          command: { type: 'string', description: 'Stdio: executable to launch' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Stdio: command arguments',
          },
          env: {
            type: 'object',
            description: 'Stdio: environment variables, string to string',
            additionalProperties: { type: 'string' },
          },
          url: { type: 'string', description: 'Remote: server endpoint URL' },
          type: { type: 'string', enum: ['sse', 'http'], description: 'Remote transport kind' },
          headers: {
            type: 'object',
            description: 'Remote: HTTP headers, string to string',
            additionalProperties: { type: 'string' },
          },
          enabled: { type: 'boolean', description: 'Defaults to true' },
        },
        required: ['serverId'],
      },
      execute: (raw) => runGuard(() => applyConnect(deps, raw)),
    }),
    tool('mcp_check', {
      group: 'mcp',
      operations: ['mcp_manage'],
      sideEffect: 'read',
      description:
        'Health-check a configured MCP server: fresh connection attempt, returns { connected, tools } or an error. ' +
        'Read-only, does not touch running runtimes.',
      input: {
        type: 'object',
        properties: { serverId: SERVER_ID_PROPERTY },
        required: ['serverId'],
      },
      execute: (raw) => runGuard(() => applyCheck(deps, raw)),
    }),
    tool('mcp_toggle', {
      group: 'mcp',
      operations: ['mcp_manage'],
      sideEffect: 'write',
      description:
        'Enable or disable a configured MCP server in the org config. Disabling keeps the entry but stops it from launching.',
      input: {
        type: 'object',
        properties: { serverId: SERVER_ID_PROPERTY, enabled: { type: 'boolean' } },
        required: ['serverId', 'enabled'],
      },
      execute: (raw) => runGuard(() => applyToggle(deps, raw)),
    }),
    tool('mcp_remove', {
      group: 'mcp',
      operations: ['mcp_manage'],
      sideEffect: 'write',
      description: 'Remove an MCP server entry from the org config.',
      input: {
        type: 'object',
        properties: { serverId: SERVER_ID_PROPERTY },
        required: ['serverId'],
      },
      execute: (raw) => runGuard(() => applyRemove(deps, raw)),
    }),
  ];
}
