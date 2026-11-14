import { AddonError } from '@harnesys/sdk';

export function scheduleSecondsOf(value: unknown, now: Date): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AddonError('invalid_params', {
      detail: 'scheduleAt must be an ISO 8601 timestamp, for example 2026-05-01T09:00:00Z',
    });
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at)) {
    throw new AddonError('invalid_params', {
      detail: `scheduleAt is not a valid ISO 8601 timestamp: "${value}"`,
    });
  }
  if (at <= now.getTime()) {
    throw new AddonError('invalid_params', {
      detail: `scheduleAt must be in the future, got ${new Date(at).toISOString()}`,
    });
  }
  return Math.floor(at / 1000);
}