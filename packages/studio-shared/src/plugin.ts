import type {
  ComponentSource,
  ComponentStatus,
  PluginDiagnostic,
  PluginKind,
  PluginName,
  PluginSourceFormat,
} from 'harnesys';

export type {
  ComponentSource,
  ComponentStatus,
  PluginDiagnostic,
  PluginKind,
  PluginName,
  PluginSourceFormat,
} from 'harnesys';
export type GrantClass = 'content' | 'process' | 'network';
export type ComponentOrigin =
  | {
      kind: 'project';
    }
  | {
      kind: 'plugin';
      pluginName: PluginName;
      status: ComponentStatus;
      inertReason?: string;
    };
export type PluginGrantSelection = Partial<Record<GrantClass, boolean>>;
export type PluginOptionValue = string | number | boolean;
export interface PluginRecord {
  projectId: string;
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  format: PluginSourceFormat | 'unknown';
  grants: PluginGrantSelection;
  options: Record<string, PluginOptionValue>;
  registryId?: string;
  catalogPluginName?: string;
  installedAt: string;
  updatedAt: string;
}
export interface PluginComponentSummary {
  kind: PluginKind;
  status: ComponentStatus;
  inertReason?: string;
  source: ComponentSource;
}
export type PluginSummary = PluginRecord & {
  version?: string;
  description?: string;
  components: PluginComponentSummary[];
  skillCount: number;
  hookCount: number;
  mcpServerCount: number;
  agentCount: number;
  commandCount: number;
  lspServerCount: number;
};
export interface PluginMutationResponse {
  plugin: PluginSummary;
  diagnostics: PluginDiagnostic[];
}
export type PluginListItem = PluginMutationResponse;
export interface InstallPluginRequest {
  source?: string;
  path?: string;
  ref?: string;
  registryId?: string;
  catalogPluginName?: string;
  pluginName?: string;
}
export interface SetPluginGrantsRequest {
  classes: GrantClass[];
}
export interface ApprovePluginServerRequest {
  serverId: string;
}
export interface SetPluginOptionRequest {
  key: string;
  value: PluginOptionValue;
}
export type PluginRegistryKind = 'claude-marketplace';
export interface PluginRegistrySummary {
  id: string;
  name: string;
  kind: PluginRegistryKind;
  source: string;
  path: string;
  revision?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AddPluginRegistryRequest {
  source: string;
  kind?: PluginRegistryKind;
}
export type CatalogInstallSource =
  | {
      type: 'relative';
      path: string;
    }
  | {
      type: 'github';
      repo: string;
      ref?: string;
      sha?: string;
    }
  | {
      type: 'url';
      url: string;
      ref?: string;
      sha?: string;
    }
  | {
      type: 'git-subdir';
      url: string;
      path: string;
      ref?: string;
      sha?: string;
    }
  | {
      type: 'npm';
      package: string;
      version?: string;
      registry?: string;
    }
  | {
      type: 'archive';
      url: string;
      sha256?: string;
    };
export interface PluginCatalogEntry {
  registryId: string;
  pluginName: string;
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  homepage?: string;
  installable: boolean;
  unsupportedReason?: string;
  installSource?: CatalogInstallSource;
  format?: PluginSourceFormat | 'unknown';
  inertComponents?: PluginKind[];
}
export interface RemovePluginRequest {
  deleteData?: boolean;
}
