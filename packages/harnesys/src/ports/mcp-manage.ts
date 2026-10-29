import type { CapabilityScope } from '../domain/pack.ts';
import type { McpServerInfo, StdioEntry, UrlEntry } from './mcp.ts';

export type McpServerEntry = StdioEntry | UrlEntry;

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpHealthReport {
  serverId: string;
  connected: boolean;
  tools: McpToolInfo[];
  error?: string;
}

export interface McpServerOverview {
  serverId: string;
  transport: string;
  managed: boolean;
  enabled: boolean;
  connected: boolean;
  command?: string;
  url?: string;
  toolCount: number;
  tools: McpToolInfo[];
}

export interface McpManagePort {
  list(scope: CapabilityScope): Promise<McpServerOverview[]>;
  upsert(scope: CapabilityScope, serverId: string, entry: McpServerEntry): Promise<McpHealthReport>;
  remove(scope: CapabilityScope, serverId: string): Promise<void>;
  setEnabled(scope: CapabilityScope, serverId: string, enabled: boolean): Promise<McpHealthReport>;
  health(scope: CapabilityScope, serverId: string): Promise<McpHealthReport>;
}

export type { McpServerInfo };
