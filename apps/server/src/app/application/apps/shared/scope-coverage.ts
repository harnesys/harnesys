import type { AccountErrorCode, FieldErrorCode } from '../../../domain/apps/errors.ts';
import { InvalidFieldsException, ProviderError } from '../../../domain/apps/errors.ts';
import type { FieldSpec } from '../../../domain/apps/field.ts';

export function unionScopes(...groups: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const scope of group) {
      seen.add(scope);
    }
  }
  return [...seen];
}

export function coversScopes(granted: readonly string[], required: readonly string[]): boolean {
  const owned = new Set(granted);
  return required.every((scope) => owned.has(scope));
}

export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  const owned = new Set(granted);
  return required.filter((scope) => !owned.has(scope));
}

export function assertKnownScopes(known: readonly string[], requested: readonly string[]): void {
  if (known.length === 0 && requested.length > 0) {
    throw new InvalidFieldsException({ scopes: 'option' });
  }
  const unknown = requested.filter((scope) => !known.includes(scope));
  if (unknown.length > 0) {
    throw new InvalidFieldsException({ scopes: 'option' });
  }
}

export function requiredSecretKeys(fields: readonly FieldSpec[]): string[] {
  return fields
    .filter((field) => field.required && (field.type === 'secret' || field.generated === true))
    .map((field) => field.key);
}

export interface SecretCheckInput {
  allowed: readonly string[];
  fields: readonly FieldSpec[];
  secrets: Record<string, string>;
  stored?: readonly string[];
}

export function assertSecretShape(input: SecretCheckInput): void {
  const allowed = new Set(input.allowed);
  const provided = Object.keys(input.secrets);
  const stray = provided.filter((key) => !allowed.has(key));
  if (stray.length > 0) {
    throw invalidResponse(stray);
  }
  const stored = new Set(input.stored ?? []);
  const missing = requiredSecretKeys(input.fields).filter(
    (key) => input.secrets[key] === undefined && !stored.has(key),
  );
  if (missing.length > 0) {
    throw invalidResponse(missing);
  }
}

function invalidResponse(keys: string[]): Error {
  return keys.length > 0
    ? new ProviderError('invalid_response')
    : new ProviderError('invalid_response');
}

export type { AccountErrorCode, FieldErrorCode };
