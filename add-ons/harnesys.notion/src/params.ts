import { AddonError } from '@harnesys/sdk';

export function requireStr(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AddonError('invalid_params', {
      detail: `${key} is required and must be a non-empty string`,
    });
  }
  return value.trim();
}

export function optionalStr(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

export function optionalInt(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new AddonError('invalid_params', {
      detail: `${key} must be an integer between ${min} and ${max}`,
    });
  }
  return num;
}

export function optionalBool(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function optionalRecord(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AddonError('invalid_params', {
      detail: `${key} must be an object`,
    });
  }
  return value as Record<string, unknown>;
}

export function enumOf<T extends string>(
  input: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new AddonError('invalid_params', {
      detail: `${key} must be one of: ${values.join(', ')}`,
    });
  }
  return value as T;
}

export function requireEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T {
  const value = enumOf(input, key, values);
  if (value === undefined) {
    throw new AddonError('invalid_params', {
      detail: `${key} is required and must be one of: ${values.join(', ')}`,
    });
  }
  return value;
}
