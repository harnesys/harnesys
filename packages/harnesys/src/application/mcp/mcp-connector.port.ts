import type { McpServerConfig } from '../../domain/mcp.ts';
export interface RawToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface RawResourceDescriptor {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}
export interface ListResourcesPage {
  resources: RawResourceDescriptor[];
  nextCursor?: string;
}
export interface RawResourceTextContent {
  uri: string;
  name?: string;
  title?: string;
  mimeType?: string;
  text: string;
}
export interface RawResourceBlobContent {
  uri: string;
  name?: string;
  title?: string;
  mimeType?: string;
  blob: string;
}
export type RawResourceContent = RawResourceTextContent | RawResourceBlobContent;
export interface RawResourceReadResult {
  contents: RawResourceContent[];
}
export interface McpConnection {
  serverId: string;
  listTools(): Promise<RawToolDescriptor[]>;
  callTool(name: string, input: unknown): Promise<unknown>;
  listResources(cursor?: string): Promise<ListResourcesPage>;
  readResource(uri: string): Promise<RawResourceReadResult>;
  close(): Promise<void>;
}
export interface McpConnector {
  connect(config: McpServerConfig): Promise<McpConnection>;
}
