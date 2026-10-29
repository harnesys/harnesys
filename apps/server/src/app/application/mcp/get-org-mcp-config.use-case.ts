import { Injectable } from '@harnesys/brix';
import type {
  ListOrgMcpConfigResponse,
  McpConfigServer,
  McpTransportKind,
} from '@harnesys/contracts';
import type { McpServerInfo, McpServerSpec, PluginComponent } from 'harnesys';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import type { PluginServerDisable } from '../../domain/plugin/plugin.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import type {
  LoadedOrgPlugin,
  PluginRuntimeBundle,
} from '../../domain/plugin/plugin-runtime.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { componentGrantClass } from '../plugins/plugin-grant-gate.ts';

export interface GetOrgMcpConfigRequest {
  orgId: string;
}

@Injectable()
export class GetOrgMcpConfigUseCase {
  constructor(
    private readonly mcp: OrgMcpPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: GetOrgMcpConfigRequest): Promise<ListOrgMcpConfigResponse> {
    const org = this.mcp.listConfig(request.orgId);
    const bundle = await this.pluginRuntime.bundle(request.orgId);
    const disabled = pluginServerKeys(this.plugins.listDisabledServers(request.orgId));
    const live = new Map(
      (await this.executor.listMcpServers(request.orgId)).map((server) => [
        server.serverId,
        server,
      ]),
    );
    return {
      servers: [
        ...org.servers.map((server) => withLive(server, live.get(server.serverId))),
        ...bundle.entries
          .toSorted((a, b) => a.record.name.localeCompare(b.record.name))
          .flatMap((entry) => pluginServersOf(entry, bundle, disabled, live)),
      ],
    };
  }
}

function pluginServerKeys(disabled: PluginServerDisable[]): Set<string> {
  return new Set(disabled.map((entry) => `plugin:${entry.pluginName}:${entry.serverId}`));
}

function withLive(server: McpConfigServer, snap: McpServerInfo | undefined): McpConfigServer {
  return {
    ...server,
    connected: server.enabled && (snap?.connected ?? false),
    toolCount: server.enabled ? (snap?.tools.length ?? 0) : 0,
  };
}

function pluginServersOf(
  entry: LoadedOrgPlugin,
  bundle: PluginRuntimeBundle,
  disabled: ReadonlySet<string>,
  live: ReadonlyMap<string, McpServerInfo>,
): McpConfigServer[] {
  return entry.ir.components
    .filter((component) => component.kind === 'mcp-server')
    .map((component) => pluginServerOf(entry, bundle, component, disabled, live));
}

function pluginServerOf(
  entry: LoadedOrgPlugin,
  bundle: PluginRuntimeBundle,
  component: PluginComponent,
  disabled: ReadonlySet<string>,
  live: ReadonlyMap<string, McpServerInfo>,
): McpConfigServer {
  const spec = component.spec as McpServerSpec;
  const serverId = `plugin:${entry.record.name}:${spec.serverId}`;
  const disabledByUser = disabled.has(serverId);
  const native = component.status === 'native';
  const grant = componentGrantClass(component, entry.ir);
  const merged = bundle.mcpJson.mcpServers[serverId];
  const enabled = native && !disabledByUser;
  const snap = enabled ? live.get(serverId) : undefined;
  return {
    serverId,
    enabled,
    transport: transportOf(spec),
    ...fieldsOf(merged, spec),
    connected: enabled && (snap?.connected ?? false),
    toolCount: enabled ? (snap?.tools.length ?? 0) : 0,
    origin: {
      kind: 'plugin',
      pluginName: entry.record.name,
      ...(native ? {} : { status: component.status, ...inertReasonOf(component) }),
    },
    ...(disabledByUser ? { disabledByUser: true } : {}),
    ...(grant !== undefined ? { requiredGrant: grant } : {}),
  };
}

function transportOf(spec: McpServerSpec): McpTransportKind {
  if (spec.config.type === 'stdio') {
    return 'stdio';
  }
  return spec.config.type === 'sse' ? 'sse' : 'http';
}

function fieldsOf(merged: unknown, spec: McpServerSpec): Partial<McpConfigServer> {
  const fromMerged = mergedFieldsOf(merged);
  if (Object.keys(fromMerged).length > 0) {
    return fromMerged;
  }
  return specFieldsOf(spec);
}

function specFieldsOf(spec: McpServerSpec): Partial<McpConfigServer> {
  if (spec.config.type === 'stdio') {
    return {
      command: spec.config.command,
      ...(spec.config.args !== undefined ? { args: spec.config.args } : {}),
      ...(spec.config.env !== undefined ? { env: spec.config.env } : {}),
    };
  }
  return {
    url: spec.config.url,
    ...(spec.config.headers !== undefined ? { headers: spec.config.headers } : {}),
  };
}

function mergedFieldsOf(merged: unknown): Partial<McpConfigServer> {
  if (!merged || typeof merged !== 'object' || Array.isArray(merged)) {
    return {};
  }
  const row = merged as Record<string, unknown>;
  const out: Partial<McpConfigServer> = {};
  if (typeof row.command === 'string') {
    out.command = row.command;
  }
  if (Array.isArray(row.args)) {
    out.args = row.args.filter((arg): arg is string => typeof arg === 'string');
  }
  if (isStringRecord(row.env)) {
    out.env = row.env;
  }
  if (typeof row.url === 'string') {
    out.url = row.url;
  }
  if (isStringRecord(row.headers)) {
    out.headers = row.headers;
  }
  return out;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function inertReasonOf(component: PluginComponent): { inertReason: string } | undefined {
  return component.status === 'blocked_by_grant' && typeof component.inertReason === 'string'
    ? { inertReason: component.inertReason }
    : undefined;
}
