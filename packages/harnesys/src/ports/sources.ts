import type { CapabilityScope } from '../domain/pack.ts';

export type SourcesUiVisibility = 'org' | 'host';

export interface SourcesSummary {
  id: string;
  name: string;
  managed: boolean;
  uiVisibility: SourcesUiVisibility;
  vcs: 'git' | null;
  hostId: string | null;
}

export interface SourcesAttachFolderInput {
  absolutePath: string;
  name?: string;
  uiVisibility?: SourcesUiVisibility;
}

export interface SourcesUpdateInput {
  sourceId: string;
  name?: string;
  uiVisibility?: SourcesUiVisibility;
}

export interface SourcesPort {
  list(scope: CapabilityScope): Promise<SourcesSummary[]>;
  attachFolder(scope: CapabilityScope, input: SourcesAttachFolderInput): Promise<SourcesSummary>;
  update(scope: CapabilityScope, input: SourcesUpdateInput): Promise<SourcesSummary>;
}
