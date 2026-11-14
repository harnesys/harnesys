import { AddonError } from '@harnesys/sdk';
import { numberValue } from './numbers.ts';
import type { ParseMode } from './telegram-types.ts';

const PARSE_MODES: readonly ParseMode[] = ['none', 'markdown', 'html'];

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

export function optionalString(
  input: Record<string, unknown>,
  key: string,
  max: number,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
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

export function cappedLimitOf(input: Record<string, unknown>, key: string, fallback: number, cap: number): number {
  const value = optionalPositiveInt(input, key);
  if (value === undefined) {
    return Math.min(fallback, cap);
  }
  if (value > cap) {
    throw new AddonError('invalid_params', { detail: `${key} is capped at ${cap}` });
  }
  return value;
}

export function booleanOf(
  input: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = input[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 1) {
    return true;
  }
  if (value === 'false' || value === 0) {
    return false;
  }
  throw new AddonError('invalid_params', { detail: `${key} must be a boolean` });
}

export function parseModeParam(input: Record<string, unknown>): ParseMode {
  const value = input.parseMode;
  if (value === undefined || value === null || value === '') {
    return 'none';
  }
  if (typeof value === 'string' && (PARSE_MODES as readonly string[]).includes(value)) {
    return value as ParseMode;
  }
  throw new AddonError('invalid_params', {
    detail: `parseMode must be one of ${PARSE_MODES.join(', ')}`,
  });
}

function messageIdOf(value: unknown, key: string): number {
  const parsed = numberValue(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AddonError('invalid_params', { detail: `${key} must be positive integers` });
  }
  return parsed;
}

export function messageIdsOf(input: Record<string, unknown>, key: string, max: number): number[] {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return [];
  }
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) {
    return [];
  }
  if (list.length > max) {
    throw new AddonError('invalid_params', {
      detail: `${key} holds ${list.length} ids; at most ${max} per call`,
    });
  }
  return [...new Set(list.map((entry) => messageIdOf(entry, key)))];
}

export function requiredMessageIds(
  input: Record<string, unknown>,
  key: string,
  max: number,
): number[] {
  const ids = messageIdsOf(input, key, max);
  if (ids.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return ids;
}