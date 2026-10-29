import type {
  AgentPresetBody,
  PresetKind,
  PresetOrigin,
  TeamPresetBody,
} from '@harnesys/contracts';

export interface PresetRecord {
  id: string;
  kind: PresetKind;
  origin: PresetOrigin;
  version: string;
  name: string;
  description: string | null;
  body: AgentPresetBody | TeamPresetBody;
  author: string | null;
  installedFrom: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PresetSaveInput {
  id: string;
  kind: PresetKind;
  origin: PresetOrigin;
  version: string;
  name: string;
  description?: string | null;
  author?: string | null;
  installedFrom?: string | null;
  tags?: string[];
  body: AgentPresetBody | TeamPresetBody;
}

export abstract class PresetLibraryPort {
  abstract findAnyById(id: string): PresetRecord | null;
  abstract findById(kind: PresetKind, id: string): PresetRecord | null;
  abstract save(input: PresetSaveInput): PresetRecord;
  abstract delete(kind: PresetKind, id: string): void;
  abstract listByOrigin(origin: PresetOrigin): PresetRecord[];
  abstract deleteSystemRowsExcept(ids: string[]): void;
}
