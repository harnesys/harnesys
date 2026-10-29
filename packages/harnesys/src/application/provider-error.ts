import { APICallError, RetryError } from 'ai';

interface ProviderBody {
  providerName?: string;
  raw?: string;
  message?: string;
  code?: number;
  remedyHint?: string;
}

function parseProviderBody(error: unknown): ProviderBody {
  const body = (error as { responseBody?: unknown }).responseBody;
  if (typeof body !== 'string' || !body) {
    return {};
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        code?: number;
        metadata?: { provider_name?: string; raw?: string; remedy_hint?: string };
      };
    };
    return {
      providerName: parsed.error?.metadata?.provider_name,
      raw: parsed.error?.metadata?.raw,
      message: parsed.error?.message,
      code: parsed.error?.code,
      remedyHint: parsed.error?.metadata?.remedy_hint,
    };
  } catch {
    return {};
  }
}

function allErrors(error: unknown): unknown[] {
  const out: unknown[] = [error];
  if (RetryError.isInstance(error)) {
    out.push(...error.errors);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined) {
    out.push(cause);
  }
  return out;
}

function firstApiError(error: unknown): unknown {
  return allErrors(error).find((candidate) => APICallError.isInstance(candidate));
}

export function isRateLimitError(error: unknown): boolean {
  return allErrors(error).some(
    (candidate) =>
      APICallError.isInstance(candidate) &&
      (candidate.statusCode === 429 || /rate limit/i.test(candidate.message ?? '')),
  );
}

export function isTransientProviderError(error: unknown): boolean {
  if (isRateLimitError(error)) {
    return true;
  }
  const api = firstApiError(error);
  return api !== undefined && APICallError.isInstance(api) && (api.statusCode ?? 0) >= 500;
}

export function providerErrorCode(error: unknown): string {
  if (isRateLimitError(error)) {
    return 'provider_rate_limited';
  }
  const api = firstApiError(error);
  if (api !== undefined && APICallError.isInstance(api)) {
    const status = api.statusCode ?? 0;
    if (status >= 500) {
      return 'provider_unavailable';
    }
    if (status === 401 || status === 403) {
      return 'provider_unauthorized';
    }
    return 'provider_error';
  }
  return 'run_failed';
}

function describeProvider(error: unknown): string {
  const api = firstApiError(error);
  if (api === undefined || !APICallError.isInstance(api)) {
    return '';
  }
  const body = parseProviderBody(api);
  const who = body.providerName ? `, ${body.providerName}` : '';
  if (api.statusCode !== undefined) {
    return ` (${api.statusCode}${who})`;
  }
  if (who) {
    return ` (${who})`;
  }
  return '';
}

function shortCause(error: unknown): string {
  const api = firstApiError(error);
  if (api !== undefined && APICallError.isInstance(api)) {
    const body = parseProviderBody(api);
    const raw = body.raw ?? body.message ?? api.message;
    return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
  }
  if (error instanceof Error && error.message) {
    const single = error.message.split('\n')[0] ?? '';
    return single.length > 220 ? `${single.slice(0, 217)}…` : single;
  }
  return 'provider call failed';
}

export function retryMessage(
  error: unknown,
  attempt: number,
  maxRetries: number,
  delayMs: number,
): string {
  const cause = shortCause(error);
  const secs = Math.max(1, Math.round(delayMs / 1000));
  const label = isRateLimitError(error) ? 'Rate limited' : 'Provider unavailable';
  return `${label}${describeProvider(error)}: ${cause} Retrying ${attempt}/${maxRetries} in ${secs}s.`;
}

function remedyHint(error: unknown): string {
  if (!isRateLimitError(error)) {
    return '';
  }
  const api = firstApiError(error);
  if (api === undefined || !APICallError.isInstance(api)) {
    return '';
  }
  const hint = parseProviderBody(api).remedyHint ?? '';
  return hint.length > 220 ? `${hint.slice(0, 217)}…` : hint;
}

export function finalProviderMessage(error: unknown): string {
  const cause = shortCause(error);
  const hint = remedyHint(error);
  const tail = hint ? ` ${hint}` : '';
  const text = `Provider error${describeProvider(error)}: ${cause}.${tail}`;
  return text.length > 500 ? `${text.slice(0, 497)}…` : text;
}

export function isProviderError(error: unknown): boolean {
  return firstApiError(error) !== undefined || RetryError.isInstance(error);
}
