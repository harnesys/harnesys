import type { McpResourceInfo } from '../domain/mcp.ts';
import type { ToolDefinition } from './tools.ts';
export interface StdioEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
  toolPrefix?: string;
}
export interface UrlEntry {
  url: string;
  headers?: Record<string, string>;
  type?: 'sse' | 'http';
  enabled?: boolean;
  toolPrefix?: string;
}
export interface CursorMcpJson {
  mcpServers: McpServerEntries;
}
export type McpServerEntries = Record<string, StdioEntry | UrlEntry>;
export interface McpServerToolInfo {
  name: string;
  description: string;
}
export interface McpServerInfo {
  serverId: string;
  transport: string;
  connected: boolean;
  tools: McpServerToolInfo[];
  resources: McpResourceInfo[];
}
export interface McpRegistry {
  loadJson(json: CursorMcpJson): void | Promise<void>;
  enable(id: string): void | Promise<void>;
  disable(id: string): void | Promise<void>;
  forget(id: string): void | Promise<void>;
  reload(id?: string): void | Promise<void>;
  list(): McpServerInfo[] | Promise<McpServerInfo[]>;
  tools(): ToolDefinition[] | Promise<ToolDefinition[]>;
  closeAll(): void | Promise<void>;
}
