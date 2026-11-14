import { AddonError } from '@harnesys/sdk';

export interface ChatTarget {
  chat: string;
  topicId?: string;
}

export function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

export function optionalStr(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function optionalBool(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === 'boolean' ? value : undefined;
}

function numericValue(raw: unknown): number {
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    return Number(raw);
  }
  return Number.NaN;
}

export function intField(
  input: Record<string, unknown>,
  key: string,
  mode: 'required' | 'optional',
): number | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') {
    if (mode === 'required') {
      throw new AddonError('invalid_params', { detail: `${key} is required` });
    }
    return undefined;
  }
  const value = numericValue(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AddonError('invalid_params', { detail: `${key} must be a positive integer` });
  }
  return value;
}

export function enumField<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new AddonError('invalid_params', {
      detail: `${key} must be one of ${allowed.join(', ')}`,
    });
  }
  return raw as T;
}

export function requireText(value: string, key: string, max: number): string {
  if (value.length > max) {
    throw new AddonError('invalid_params', { detail: `${key} exceeds ${max} characters` });
  }
  return value;
}

export function chatTargetOf(value: string): ChatTarget {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) {
    return { chat: value };
  }
  const topic = value.slice(separator + 1);
  if (!/^\d+$/.test(topic)) {
    return { chat: value };
  }
  return { chat: value.slice(0, separator), topicId: topic };
}

export function chatKey(chat: string): string {
  const target = chatTargetOf(chat).chat;
  return target.startsWith('@') ? target.slice(1).toLowerCase() : target.toLowerCase();
}
