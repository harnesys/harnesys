import {
  type DiscoveredModel,
  type Effort,
  isEffort,
  isModelKind,
  MODALITIES,
  type Modality,
  type ModelPricing,
} from '@harnesys/studio-shared';
import type { DiscoveredModel as HarnesysDiscoveredModel } from 'harnesys/models';
import {
  findMatchingOpenRouterModel,
  listOpenRouterModels,
  type ModelPricingOverride,
} from 'harnesys/models';

export type { ModelPricingOverride } from 'harnesys/models';
export type ModelPricingWithOverrides = ModelPricing & { overrides?: ModelPricingOverride[] };
export interface SyncMatch {
  model: DiscoveredModel;
  ambiguous: boolean;
}

let cachedCatalogPromise: Promise<DiscoveredModel[]> | null = null;
export function fetchOpenRouterCatalog(): Promise<DiscoveredModel[]> {
  const cached = cachedCatalogPromise;
  if (cached) {
    return cached;
  }
  const fetched = listOpenRouterModels({ driver: 'openrouter' });
  cachedCatalogPromise = fetched.then(
    (list) => list.map(toViewModel),
    (error: unknown) => {
      cachedCatalogPromise = null;
      throw error;
    },
  );
  return cachedCatalogPromise;
}
export async function syncModelFromOpenRouter(modelName: string): Promise<SyncMatch | undefined> {
  const catalog = await fetchOpenRouterCatalog();
  const match = findMatchingOpenRouterModel(catalog, modelName);
  if (!match) {
    return undefined;
  }
  return { model: toViewModel(match.model), ambiguous: match.ambiguous };
}
const MODALITY_SET: ReadonlySet<string> = new Set(MODALITIES);
function toViewModel(model: HarnesysDiscoveredModel): DiscoveredModel {
  const kind = isModelKind(model.kind) ? model.kind : 'chat';
  const effort = model.effort?.filter((item): item is Effort => isEffort(item));
  const defaultEffort =
    model.defaultEffort !== undefined && isEffort(model.defaultEffort)
      ? model.defaultEffort
      : undefined;
  const architecture = model.architecture
    ? {
        ...model.architecture,
        input_modalities: filterModalities(model.architecture.input_modalities),
        output_modalities: filterModalities(model.architecture.output_modalities),
      }
    : undefined;
  return { ...model, kind, effort, defaultEffort, architecture };
}
function filterModalities(values: readonly string[] | undefined): Modality[] | undefined {
  const filtered = (values ?? []).filter((item): item is Modality => MODALITY_SET.has(item));
  return filtered.length > 0 ? filtered : undefined;
}
