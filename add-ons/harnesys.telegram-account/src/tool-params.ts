import { AddonError } from '@harnesys/sdk';
import { numberValue } from './numbers.ts';

export function requiredString(input: Record<string, unknown>, key: string, max: number): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  if (value.length > max) {
    throw new AddonError('invalid_params', { detail: `${key} exceeds ${max} characters` });
  }
  return value;
}

export function requiredChat(input: Record<string, unknown>, key: string): string {
  return requiredString(input, key, 256).trim();
}

export function optionalPositiveInt(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = numberValue(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AddonError('invalid_params', { detail: `${key} must be a positive integer` });
  }
  return value;
}

export function limitOf(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  cap: number,
): number {
  const value = optionalPositiveInt(input, key);
  if (value === undefined) {
    return Math.min(fallback, cap);
  }
  if (value > cap) {
    throw new AddonError('invalid_params', {
      detail: `${key} is capped at ${cap}; raise max_history_limit or max_dialogs in the add-on config to allow more`,
    });
  }
  return value;
}
