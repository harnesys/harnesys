export { discoverModelDetails, discoverModels } from './src/adapters/models/discover.ts';
export { listOpenRouterModels } from './src/adapters/models/discover/openrouter.ts';
export {
  findMatchingOpenRouterModel,
  type OpenRouterMatch,
} from './src/adapters/models/discover/openrouter-lookup.ts';
export type {
  DiscoveredModel,
  DiscoverInput,
  ModelFields,
  ModelPricing,
  ModelPricingOverride,
} from './src/ports/models.ts';
