import type { CatalogItem, PresetDetail, PresetKind, PresetOrigin } from '@harnesys/contracts';

export interface PresetCatalogFilter {
  kind?: PresetKind;
  origin?: PresetOrigin;
}

export abstract class PresetCatalogPort {
  abstract list(filter?: PresetCatalogFilter): CatalogItem[];
  abstract get(kind: PresetKind, id: string): PresetDetail | null;
}
