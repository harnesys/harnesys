import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type {
  ListOrgMcpConfigResponse,
  McpConfigServer,
  McpTransportKind,
  UpsertOrgMcpServerBody,
} from '@harnesys/contracts';
import { z } from 'zod';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { McpServerNotFoundException, McpValidationException } from '../../domain/mcp/mcp.error.ts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';

interface StdioEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

interface UrlEntry {
  url: string;
  type?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

type McpEntry = StdioEntry | UrlEntry;

const mcpEntrySchema = z
  .object({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().min(1).optional(),
    type: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (entry) => entry.enabled === false || entry.command !== undefined || entry.url !== undefined,
    {
      message: 'MCP server entry requires command or url',
    },
  );

const mcpJsonSchema = z.object({
  mcpServers: z.record(z.string(), mcpEntrySchema),
});

@Injectable()
export class OrgMcpJsonAdapter extends OrgMcpPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listConfig(orgId: string): ListOrgMcpConfigResponse {
    const map = this.readMap(orgId);
    const servers: McpConfigServer[] = Object.entries(map).map(([serverId, entry]) =>
      toConfigServer(serverId, entry),
    );
    return { servers };
  }

  upsert(orgId: string, serverId: string, body: UpsertOrgMcpServerBody): McpConfigServer {
    const map = this.readMap(orgId);
    const entry = fieldsToEntry(body);
    map[serverId] = entry;
    this.writeMap(orgId, map);
    return toConfigServer(serverId, entry);
  }

  remove(orgId: string, serverId: string): void {
    const map = this.readMap(orgId);
    if (!(serverId in map)) {
      throw new McpServerNotFoundException(serverId);
    }
    delete map[serverId];
    this.writeMap(orgId, map);
  }

  setEnabled(orgId: string, serverId: string, enabled: boolean): ListOrgMcpConfigResponse {
    const map = this.readMap(orgId);
    const entry = map[serverId];
    if (!entry) {
      throw new McpServerNotFoundException(serverId);
    }
    if (enabled) {
      const { enabled: _ignored, ...rest } = entry;
      map[serverId] = rest;
    } else {
      map[serverId] = { ...entry, enabled: false };
    }
    this.writeMap(orgId, map);
    return this.listConfig(orgId);
  }

  private readMap(orgId: string): Record<string, McpEntry> {
    const path = this.layout.mcpConfigPath(orgId);
    if (!existsSync(path)) {
      return {};
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new McpValidationException(
        `Invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const result = mcpJsonSchema.safeParse(parsed);
    if (!result.success) {
      throw new McpValidationException(`Invalid mcp.json: ${result.error.message}`);
    }
    return result.data.mcpServers as Record<string, McpEntry>;
  }

  private writeMap(orgId: string, mcpServers: Record<string, McpEntry>): void {
    this.layout.ensureOrgDir(orgId);
    const path = this.layout.mcpConfigPath(orgId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ mcpServers }, null, 2)}\n`, 'utf8');
  }
}

function fieldsToEntry(fields: UpsertOrgMcpServerBody): McpEntry {
  const enabled = fields.enabled !== false;
  if (fields.transport === 'stdio') {
    if (fields.command === undefined || fields.command.length === 0) {
      throw new McpValidationException('stdio transport requires command');
    }
    return {
      command: fields.command,
      ...(fields.args !== undefined ? { args: fields.args } : {}),
      ...(fields.env !== undefined ? { env: fields.env } : {}),
      ...(!enabled ? { enabled: false } : {}),
    };
  }
  if (fields.url === undefined || fields.url.length === 0) {
    throw new McpValidationException(`${fields.transport} transport requires url`);
  }
  return {
    url: fields.url,
    ...(fields.transport === 'sse' ? { type: 'sse' } : {}),
    ...(fields.headers !== undefined ? { headers: fields.headers } : {}),
    ...(!enabled ? { enabled: false } : {}),
  };
}

function toConfigServer(serverId: string, entry: McpEntry): McpConfigServer {
  const enabled = entry.enabled !== false;
  const transport = entryTransport(entry);
  if ('command' in entry) {
    return {
      serverId,
      enabled,
      transport,
      command: entry.command,
      ...(entry.args !== undefined ? { args: entry.args } : {}),
      ...(entry.env !== undefined ? { env: entry.env } : {}),
      connected: false,
      toolCount: 0,
      origin: { kind: 'org' },
    };
  }
  return {
    serverId,
    enabled,
    transport,
    url: entry.url,
    ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
    connected: false,
    toolCount: 0,
    origin: { kind: 'org' },
  };
}

function entryTransport(entry: McpEntry): McpTransportKind {
  if ('command' in entry) {
    return 'stdio';
  }
  return entry.type === 'sse' ? 'sse' : 'http';
}
