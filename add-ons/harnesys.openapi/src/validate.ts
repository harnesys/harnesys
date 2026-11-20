import type { RouteHandler } from '@harnesys/sdk';
import { normalizeAuthKind } from './store.ts';
import type { AuthKind } from './types.ts';

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${key} is required`);
  }
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${key} must be a string`);
  }
  return value.trim();
}

export function requireAuthKind(body: Record<string, unknown>): AuthKind {
  if (body.authKind === undefined || body.authKind === null || body.authKind === '') {
    return 'none';
  }
  const kind = normalizeAuthKind(body.authKind);
  if (kind === null) {
    throw new ValidationError('authKind must be one of: none, bearer, basic, header, query');
  }
  return kind;
}

export function requireAuthParam(kind: AuthKind, authParam: string | undefined): string | null {
  if (kind === 'header' || kind === 'query') {
    if (authParam === undefined || authParam.length === 0) {
      throw new ValidationError(`authParam is required for authKind '${kind}'`);
    }
    return authParam;
  }
  return authParam === undefined || authParam.length === 0 ? null : authParam;
}

export function authLabel(kind: AuthKind, authParam: string | null): string {
  if (kind === 'header' || kind === 'query') {
    return `${kind}:${authParam ?? ''}`;
  }
  return kind;
}

export class ValidationError extends Error {}

export function safe(handler: RouteHandler): RouteHandler {
  return async (call, ctx) => {
    try {
      return await handler(call, ctx);
    } catch (error) {
      if (error instanceof ValidationError) {
        return { status: 400, body: { error: error.message } };
      }
      throw error;
    }
  };
}
