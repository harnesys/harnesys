export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
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
