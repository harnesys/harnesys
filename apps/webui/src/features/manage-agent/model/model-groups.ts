import type { ProviderPublic } from '@harnesys/studio-shared';
export interface ModelOption {
  value: string;
  name: string;
  provider: string;
  usable: boolean;
  reason: string;
}
export interface ModelGroup {
  provider: string;
  models: ModelOption[];
}
export function modelGroups(
  providers: ProviderPublic[],
  allowedKinds: readonly string[] = ['chat'],
): ModelGroup[] {
  return providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      provider: provider.name,
      models: provider.models.map((model) => {
        const reason = unusableReason(model, allowedKinds);
        return {
          value: model.id,
          name: model.name,
          provider: provider.name,
          usable: reason === '',
          reason,
        };
      }),
    }))
    .filter((group) => group.models.length > 0);
}
function unusableReason(
  model: { kind?: string | null; contextWindow?: number | null },
  allowedKinds: readonly string[],
): string {
  if (model.kind !== undefined && model.kind !== null && !allowedKinds.includes(model.kind)) {
    return `not a supported model (${model.kind})`;
  }
  if (typeof model.contextWindow !== 'number' || model.contextWindow <= 0) {
    return 'no context window';
  }
  return '';
}
export function modelOptions(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((group) => group.models);
}
