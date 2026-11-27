import { stringifyJson } from '@/shared/lib/download-json';

export async function copyJson(value: unknown): Promise<void> {
  await navigator.clipboard.writeText(stringifyJson(value));
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function requestTimestamp(name: string): number | null {
  const value = Number(name.split('-')[0]);
  return Number.isFinite(value) ? value : null;
}
