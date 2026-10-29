export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

export async function copyJson(value: unknown): Promise<void> {
  await navigator.clipboard.writeText(stringifyJson(value));
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([stringifyJson(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function requestTimestamp(name: string): number | null {
  const value = Number(name.split('-')[0]);
  return Number.isFinite(value) ? value : null;
}
