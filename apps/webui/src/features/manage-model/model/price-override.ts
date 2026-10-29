export interface PricePerMillionValues {
  inputPer1M: number;
  outputPer1M: number;
}

export function parsePricePer1M(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function priceOverrideValues(input: string, output: string): PricePerMillionValues | null {
  const inputPer1M = parsePricePer1M(input);
  const outputPer1M = parsePricePer1M(output);
  if (inputPer1M === null || outputPer1M === null) {
    return null;
  }
  return { inputPer1M, outputPer1M };
}

export function formatPricePer1M(value: number): string {
  return String(value);
}
