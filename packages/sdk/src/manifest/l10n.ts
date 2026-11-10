import { z } from 'zod';

export type L10n = string | Record<string, string>;

export const L10nSchema = z.union([z.string(), z.record(z.string(), z.string())]);

export interface L10nResolveOptions {
  locale: string;
  dict?: Record<string, string>;
}

export function resolveL10n(value: L10n, options: L10nResolveOptions): string {
  if (typeof value === 'string') {
    return interpolate(value, options.dict);
  }
  const direct = value[options.locale] ?? value.en ?? Object.values(value)[0];
  return interpolate(direct ?? '', options.dict);
}

function interpolate(text: string, dict?: Record<string, string>): string {
  if (!dict) {
    return text;
  }
  return text.replace(/%([A-Za-z0-9_.-]+)%/g, (whole, key: string) => dict[key] ?? whole);
}

export function l10nKeys(value: L10n): string[] {
  const source = typeof value === 'string' ? [value] : Object.values(value);
  const keys: string[] = [];
  for (const text of source) {
    for (const match of text.matchAll(/%([A-Za-z0-9_.-]+)%/g)) {
      const key = match[1];
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}
