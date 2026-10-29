export function folderNameFromPath(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (trimmed.length === 0) {
    return '';
  }
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}
