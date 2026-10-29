const PER_MILLION = 1_000_000;

export function formatPricePer1M(pricePerToken: string): string {
  const perToken = Number.parseFloat(pricePerToken);
  if (!Number.isFinite(perToken)) {
    return `$${pricePerToken}`;
  }
  const per1M = perToken * PER_MILLION;
  return `$${per1M.toFixed(per1M >= 1 ? 2 : 4)}`;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}
