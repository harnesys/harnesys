import type { ProviderPublic } from '@harnesys/studio-shared';
import type { AgentModelRef } from 'harnesys';

/**
 * Node-level model refs store provider/model *names* (engine contract), while
 * the catalog UI works with model ids. These helpers map between the two.
 */
export function refOfModelId(
  modelId: string,
  providers: ProviderPublic[],
): AgentModelRef | undefined {
  for (const provider of providers) {
    const model = provider.models.find((item) => item.id === modelId);
    if (model) {
      return { provider: provider.name, model: model.name };
    }
  }
  return undefined;
}
export function modelIdOfRef(
  ref: AgentModelRef | undefined,
  providers: ProviderPublic[],
): string | null {
  if (!ref || typeof ref !== 'object' || !ref.provider || !ref.model) {
    return null;
  }
  const provider = providers.find((item) => item.name === ref.provider);
  const model = provider?.models.find((item) => item.name === ref.model);
  return model?.id ?? null;
}
