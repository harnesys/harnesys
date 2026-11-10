import type { AccountErrorCode } from '../../../../domain/apps/errors.ts';
import { ProviderError } from '../../../../domain/apps/errors.ts';
import type { HttpOutcome } from '../../../../domain/apps/provider-module.ts';

export type HttpResponseOutcome = Extract<HttpOutcome, { status: number }>;

export function requireHttp(outcome: HttpOutcome): HttpResponseOutcome {
  if (outcome.kind === 'ok' || outcome.kind === 'http_error') {
    return outcome;
  }
  throw new ProviderError(
    outcome.kind === 'timeout' || outcome.kind === 'network_error'
      ? 'provider_unavailable'
      : 'invalid_response',
  );
}

export function classifyHttp(outcome: HttpOutcome): AccountErrorCode | null {
  if (outcome.kind === 'timeout' || outcome.kind === 'network_error') {
    return 'provider_unavailable';
  }
  if (outcome.kind === 'blocked') {
    return 'provider_unavailable';
  }
  if (outcome.kind === 'too_large') {
    return 'invalid_response';
  }
  if (outcome.status >= 200 && outcome.status < 300) {
    return null;
  }
  if (outcome.status === 401) {
    return 'invalid_credentials';
  }
  if (outcome.status === 403) {
    return 'insufficient_scopes';
  }
  if (outcome.status === 404) {
    return 'not_found';
  }
  if (outcome.status === 429) {
    return 'rate_limited';
  }
  if (outcome.status >= 500) {
    return 'provider_unavailable';
  }
  return 'invalid_response';
}
