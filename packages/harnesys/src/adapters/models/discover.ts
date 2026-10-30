import type { DiscoveredModel, DiscoverInput } from '../../ports/models.ts';
import { DiscoverError } from './binding.ts';
import { discoverAdapter } from './discover/registry.ts';

export { DiscoverError };
export function discoverModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return discoverAdapter(input.driver).list(input);
}
export function discoverModelDetails(
  input: DiscoverInput,
  name: string,
): Promise<DiscoveredModel | undefined> {
  const adapter = discoverAdapter(input.driver);
  if (!adapter.details) {
    return Promise.resolve(undefined);
  }
  return adapter.details(input, name);
}
