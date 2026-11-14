import { AddonError } from '@harnesys/sdk';

export interface YoutubeAccountRef {
  accountId?: string;
}

export function accountOf(input: Record<string, unknown>): YoutubeAccountRef {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
}

export function maxResultsOf(
  input: Record<string, unknown>,
  fallback: number,
  limit: number,
): number {
  const raw = input.maxResults;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return fallback;
  }
  return Math.min(Math.max(1, raw), limit);
}

export function requiredTextOf(input: Record<string, unknown>, key: string): string {
  const value = optionalTextOf(input, key);
  if (value === undefined) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

export function optionalTextOf(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  return raw === '' ? undefined : raw;
}
