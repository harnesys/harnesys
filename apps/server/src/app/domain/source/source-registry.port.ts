import type {
  SourceAvailability,
  SourceDistribution,
  SourceVcs,
  UiVisibility,
} from '@harnesys/contracts';

export interface SourceRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  distribution: SourceDistribution;
  uiVisibility: UiVisibility;
  managed: boolean;
  vcs: SourceVcs | null;
  availability: SourceAvailability;
  lspJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsertSourceInput {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  distribution: SourceDistribution;
  uiVisibility: UiVisibility;
  managed: boolean;
  vcs?: SourceVcs | null;
  availability?: SourceAvailability;
  createdAt: string;
  updatedAt: string;
}

export abstract class SourceRegistryPort {
  abstract list(orgId: string): SourceRecord[];
  abstract findById(orgId: string, sourceId: string): SourceRecord | null;
  abstract findManagedWorkspace(orgId: string): SourceRecord | null;
  abstract insert(input: InsertSourceInput): void;
  abstract updateVisibility(orgId: string, sourceId: string, uiVisibility: UiVisibility): void;
  abstract updateName(orgId: string, sourceId: string, name: string): void;
  abstract updateDistribution(
    orgId: string,
    sourceId: string,
    distribution: SourceDistribution,
  ): void;
  abstract updateVcs(orgId: string, sourceId: string, vcs: SourceVcs | null): void;
  abstract updateAvailability(
    orgId: string,
    sourceId: string,
    availability: SourceAvailability,
  ): void;
  abstract updateLspJson(orgId: string, sourceId: string, lspJson: string | null): void;
  abstract remove(orgId: string, sourceId: string): void;
}
