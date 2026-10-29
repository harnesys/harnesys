import type { GrantClass, PluginOptionValue } from '@harnesys/contracts';

export type PluginInstallFormat = 'agent-plugins' | 'claude-compat' | 'unknown';

export type PluginGrants = Partial<Record<GrantClass, boolean>>;

export interface PluginInstallRecord {
  orgId: string;
  name: string;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  format: PluginInstallFormat;
  grants: PluginGrants;
  options: Record<string, PluginOptionValue>;
  registryId?: string;
  catalogPluginName?: string;
  installedAt: string;
  updatedAt: string;
}

export interface PluginServerDisable {
  pluginName: string;
  serverId: string;
}
