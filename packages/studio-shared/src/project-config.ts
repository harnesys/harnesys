import type {
  McpResourceInfo as ProjectMcpResource,
  ToolCatalogEntry as ProjectTool,
} from 'harnesys';
import type { ComponentOrigin, GrantClass } from './plugin.ts';
export interface ProjectSkill {
  name: string;
  description: string;
  whenToUse?: string;
  origin: ComponentOrigin;
}
export interface CreateProjectSkillRequest {
  name: string;
  description: string;
  whenToUse?: string;
  instructions: string;
}
export type ProjectMcpTransport = 'stdio' | 'http' | 'sse';
export interface ProjectMcpServer {
  serverId: string;
  transport: ProjectMcpTransport;
  connected: boolean;
  toolCount: number;
  tools: ProjectTool[];
  resources: ProjectMcpResource[];
}
export interface ProjectMcpConfigServer {
  serverId: string;
  enabled: boolean;
  transport: ProjectMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  connected: boolean;
  toolCount: number;
  origin: ComponentOrigin;
  disabledByUser?: boolean;
  requiredGrant?: GrantClass;
}
export interface UpsertProjectMcpServerRequest {
  enabled?: boolean;
  transport: ProjectMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}
