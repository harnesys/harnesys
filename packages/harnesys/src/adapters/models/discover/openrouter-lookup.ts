import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { listOpenRouterModels, parseOpenRouterList } from './openrouter.ts';

export { parseOpenRouterList };

const LOOKUP_DRIVER: DiscoverInput = { driver: 'openrouter' };
let catalogPromise: Promise<DiscoveredModel[]> | null = null;
function catalog(): Promise<DiscoveredModel[]> {
  if (!catalogPromise) {
    catalogPromise = listOpenRouterModels(LOOKUP_DRIVER).catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}
export async function findOpenRouterModel(name: string): Promise<DiscoveredModel | undefined> {
  const list = await catalog();
  return findMatchingOpenRouterModel(list, name)?.model;
}
export interface OpenRouterMatch {
  model: DiscoveredModel;
  ambiguous: boolean;
}
export function findMatchingOpenRouterModel(
  catalogList: DiscoveredModel[],
  query: string,
): OpenRouterMatch | undefined {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return undefined;
  }
  const exact = catalogList.find((item) => item.name.toLowerCase() === normalizedQuery);
  if (exact) {
    return { model: exact, ambiguous: false };
  }
  const querySuffix = suffixOf(normalizedQuery);
  const suffixMatches = catalogList.filter(
    (item) => suffixOf(item.name.toLowerCase()) === querySuffix,
  );
  const firstMatch = suffixMatches[0];
  if (suffixMatches.length === 1 && firstMatch) {
    return { model: firstMatch, ambiguous: false };
  }
  if (suffixMatches.length > 1 && firstMatch) {
    const baseMatch = suffixMatches.find((item) => !item.name.includes(':')) ?? firstMatch;
    return { model: baseMatch, ambiguous: true };
  }
  const strippedQuery = stripDateAndVariant(querySuffix);
  for (const item of catalogList) {
    const itemStripped = stripDateAndVariant(suffixOf(item.name.toLowerCase()));
    if (itemStripped === strippedQuery) {
      return { model: item, ambiguous: true };
    }
  }
  for (const item of catalogList) {
    const itemSuffix = suffixOf(item.name.toLowerCase());
    if (itemSuffix.startsWith(strippedQuery) || strippedQuery.startsWith(itemSuffix)) {
      return { model: item, ambiguous: true };
    }
  }
  return undefined;
}
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
function suffixOf(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? name.slice(slash + 1) : name;
}
function stripDateAndVariant(name: string): string {
  return name
    .replace(/:\w+$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '');
}
