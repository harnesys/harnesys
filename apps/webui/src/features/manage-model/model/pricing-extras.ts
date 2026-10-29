import type { ModelPricing } from '@harnesys/studio-shared';
import type { ModelPricingOverride, ModelPricingWithOverrides } from './openrouter-sync';

export interface PricingExtras {
  image?: string;
  request?: string;
  overrides?: ModelPricingOverride[];
}

export function pricingExtrasFrom(pricing?: ModelPricing): PricingExtras {
  const source = pricing as ModelPricingWithOverrides | undefined;
  return {
    image: source?.image,
    request: source?.request,
    overrides: source?.overrides,
  };
}

export function mergePricingExtras(
  pricing: ModelPricing | undefined,
  extras: PricingExtras,
): ModelPricing | undefined {
  if (!pricing) {
    return undefined;
  }
  const merged: ModelPricingWithOverrides = {
    ...pricing,
    image: extras.image ?? pricing.image,
    request: extras.request ?? pricing.request,
    overrides: extras.overrides,
  };
  return merged;
}
