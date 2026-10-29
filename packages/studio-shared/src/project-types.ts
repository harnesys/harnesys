import type { PluginDiagnostic } from './plugin.ts';

export interface ProjectStatus {
  exists: boolean;
  kind: 'folder' | 'git';
  branch?: string;
  dirty?: boolean;
}
export interface StudioErrorBody {
  error: string;
}
export interface ProjectFileEntry {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  size?: number;
  modifiedAt?: string;
  pruned?: boolean;
}
export interface ProjectLspEntry {
  serverId: string;
  origin: 'file' | string;
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  disabled: boolean;
  granted: boolean;
  binaryOk: boolean;
  status: 'live' | 'off' | 'error';
  lastError?: string;
}
export interface ProjectLspListResponse {
  servers: ProjectLspEntry[];
  diagnostics: PluginDiagnostic[];
}
