import type { McpLastCheck, UpsertOrgMcpServerBody } from '@harnesys/contracts';
import type {
  CapabilityScope,
  McpConnector,
  McpHealthReport,
  McpManagePort,
  McpServerEntry,
  McpServerInfo,
  McpServerOverview,
} from 'harnesys';
import { CONSOLE_LOGGER, McpRegistry } from 'harnesys';
import type { McpVaultLookup } from '../../../application/mcp/resolve-mcp-vault-placeholders.ts';
import {
  McpVaultKeyNotFoundError,
  resolveMcpVaultEntry,
} from '../../../application/mcp/resolve-mcp-vault-placeholders.ts';
import { OrgMcpPort } from '../../../domain/mcp/org-mcp.port.ts';

export interface OrgMcpManageDeps {
  orgId: string;
  config: OrgMcpPort;
  listLive: () => Promise<McpServerInfo[]>;

  invalidateBundle: () => Promise<void> | void;

  apply: (serverId: string, entry: McpServerEntry | null) => Promise<void>;
  probe?: (serverId: string, entry: McpServerEntry) => Promise<McpHealthReport>;
  vaultLookup?: McpVaultLookup;
  connector?: McpConnector;
}

export class OrgMcpManagePort implements McpManagePort {
  constructor(private readonly deps: OrgMcpManageDeps) {}

  async list(_scope: CapabilityScope): Promise<McpServerOverview[]> {
    const config = this.deps.config.listConfig(this.deps.orgId);
    const live = new Map((await this.deps.listLive()).map((row) => [row.serverId, row]));
    const managed = new Set(config.servers.map((row) => row.serverId));
    const out: McpServerOverview[] = config.servers.map((row) => {
      const liveRow = live.get(row.serverId);
      return toOverview(row, liveRow, true);
    });
    for (const row of live.values()) {
      if (managed.has(row.serverId)) {
        continue;
      }
      out.push({
        serverId: row.serverId,
        transport: row.transport,
        managed: false,
        enabled: true,
        connected: row.connected,
        ...(row.connectedAt === undefined ? {} : { connectedAt: row.connectedAt }),
        toolCount: row.tools.length,
        tools: row.tools,
      });
    }
    return out;
  }

  async upsert(
    _scope: CapabilityScope,
    serverId: string,
    entry: McpServerEntry,
  ): Promise<McpHealthReport> {
    if (entry.enabled === false) {
      throw new Error('mcp_connect stores enabled servers; use mcp_toggle to disable one');
    }
    const health = await this.probeOf(serverId, entry);
    if (!health.connected) {
      throw new Error(
        `mcp probe failed: ${health.error ?? 'server did not connect'}; nothing was stored`,
      );
    }
    this.deps.config.upsert(this.deps.orgId, serverId, toUpsertBody(entry));
    this.rememberCheck(serverId, health);
    await this.deps.invalidateBundle();
    await this.deps.apply(serverId, entry);
    return health;
  }

  async remove(_scope: CapabilityScope, serverId: string): Promise<void> {
    this.deps.config.remove(this.deps.orgId, serverId);
    await this.deps.invalidateBundle();
    await this.deps.apply(serverId, null);
  }

  async setEnabled(
    _scope: CapabilityScope,
    serverId: string,
    enabled: boolean,
  ): Promise<McpHealthReport> {
    this.deps.config.setEnabled(this.deps.orgId, serverId, enabled);
    await this.deps.invalidateBundle();
    if (!enabled) {
      await this.deps.apply(serverId, null);
      return { serverId, connected: false, tools: [], error: 'disabled' };
    }
    const entry = this.storedEntry(serverId);
    await this.deps.apply(serverId, entry);
    return this.probeAndRemember(serverId, entry);
  }

  async health(_scope: CapabilityScope, serverId: string): Promise<McpHealthReport> {
    const entry = this.storedEntry(serverId);
    if (entry.enabled === false) {
      return { serverId, connected: false, tools: [], error: 'disabled' };
    }
    return this.probeAndRemember(serverId, entry);
  }

  private storedEntry(serverId: string): McpServerEntry {
    const server = this.deps.config
      .listConfig(this.deps.orgId)
      .servers.find((row) => row.serverId === serverId);
    if (!server) {
      throw new Error(`MCP server "${serverId}" is not configured`);
    }
    if (server.command !== undefined) {
      return {
        command: server.command,
        ...(server.args !== undefined ? { args: server.args } : {}),
        ...(server.env !== undefined ? { env: server.env } : {}),
        ...(!server.enabled ? { enabled: false } : {}),
      };
    }
    if (server.url === undefined) {
      throw new Error(`MCP server "${serverId}" has neither command nor url`);
    }
    return {
      url: server.url,
      ...(server.transport === 'sse' ? { type: 'sse' as const } : {}),
      ...(server.headers !== undefined ? { headers: server.headers } : {}),
      ...(!server.enabled ? { enabled: false } : {}),
    };
  }

  private async probeAndRemember(
    serverId: string,
    entry: McpServerEntry,
  ): Promise<McpHealthReport> {
    const report = await this.probeOf(serverId, entry);
    this.rememberCheck(serverId, report);
    return report;
  }

  private rememberCheck(serverId: string, report: McpHealthReport): void {
    const check: McpLastCheck = {
      at: Date.now(),
      connected: report.connected,
      ...(report.error !== undefined ? { error: report.error } : {}),
    };
    try {
      this.deps.config.setLastCheck(this.deps.orgId, serverId, check);
    } catch (err) {
      CONSOLE_LOGGER.warn(
        `mcp lastCheck persist failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async probeOf(serverId: string, entry: McpServerEntry): Promise<McpHealthReport> {
    const probe = this.deps.probe;
    if (probe !== undefined) {
      return probe(serverId, entry);
    }
    const lookup = this.deps.vaultLookup;
    if (lookup === undefined) {
      return probeEntry(serverId, entry, this.deps.connector);
    }
    try {
      const resolved = await resolveMcpVaultEntry(serverId, entry, lookup, () => undefined);
      return probeEntry(serverId, resolved, this.deps.connector);
    } catch (err) {
      if (err instanceof McpVaultKeyNotFoundError) {
        return { serverId, connected: false, tools: [], error: err.message };
      }
      throw err;
    }
  }
}

function toOverview(
  row: {
    serverId: string;
    enabled: boolean;
    transport: string;
    command?: string;
    url?: string;
    lastCheck?: McpLastCheck;
  },
  live: McpServerInfo | undefined,
  managed: boolean,
): McpServerOverview {
  return {
    serverId: row.serverId,
    transport: row.transport,
    managed,
    enabled: row.enabled,
    connected: live?.connected ?? false,
    ...(live?.connectedAt === undefined ? {} : { connectedAt: live.connectedAt }),
    ...(row.command !== undefined ? { command: row.command } : {}),
    ...(row.url !== undefined ? { url: row.url } : {}),
    toolCount: live?.tools.length ?? 0,
    tools: live?.tools ?? [],
    ...(row.lastCheck !== undefined ? { lastCheck: row.lastCheck } : {}),
  };
}

async function probeEntry(
  serverId: string,
  entry: McpServerEntry,
  connector?: McpConnector,
): Promise<McpHealthReport> {
  const registry = new McpRegistry(connector, CONSOLE_LOGGER);
  try {
    await registry.loadJson({ mcpServers: { [serverId]: entry } });
    const live = (await registry.list()).find((row) => row.serverId === serverId);
    if (!live) {
      const failure = registry.lastStartFailures()[serverId];
      return { serverId, connected: false, tools: [], error: failure ?? 'server failed to start' };
    }
    return { serverId, connected: true, tools: live.tools };
  } finally {
    await registry.closeAll().catch(() => undefined);
  }
}

function toUpsertBody(entry: McpServerEntry): UpsertOrgMcpServerBody {
  if ('command' in entry) {
    return {
      transport: 'stdio',
      command: entry.command,
      ...(entry.args !== undefined ? { args: entry.args } : {}),
      ...(entry.env !== undefined ? { env: entry.env } : {}),
      ...(entry.enabled === false ? { enabled: false } : {}),
    };
  }
  return {
    transport: entry.type === 'sse' ? 'sse' : 'http',
    url: entry.url,
    ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
    ...(entry.enabled === false ? { enabled: false } : {}),
  };
}
