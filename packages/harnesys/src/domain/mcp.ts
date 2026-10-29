export interface McpStdioTransport {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
export interface McpHttpTransport {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}
export interface McpSseTransport {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}
export type McpTransport = McpStdioTransport | McpHttpTransport | McpSseTransport;
export interface McpServerConfig {
  serverId: string;
  transport: McpTransport;
  toolPrefix?: string;
  allowTools?: string[];
}
export interface McpToolInfo {
  name: string;
  description: string;
}
export interface McpResourceInfo {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}
