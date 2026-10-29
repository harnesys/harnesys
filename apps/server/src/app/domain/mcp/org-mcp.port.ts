import type {
  ListOrgMcpConfigResponse,
  McpConfigServer,
  UpsertOrgMcpServerBody,
} from '@harnesys/contracts';

export abstract class OrgMcpPort {
  abstract listConfig(orgId: string): ListOrgMcpConfigResponse;
  abstract upsert(orgId: string, serverId: string, body: UpsertOrgMcpServerBody): McpConfigServer;
  abstract remove(orgId: string, serverId: string): void;
  abstract setEnabled(orgId: string, serverId: string, enabled: boolean): ListOrgMcpConfigResponse;
}
