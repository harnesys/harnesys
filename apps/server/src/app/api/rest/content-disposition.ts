const ASCII_FALLBACK = /[^\x20-\x7e]|["\\]/g;

export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  if (kind === 'inline') {
    return 'inline';
  }
  const fallback = name.replace(ASCII_FALLBACK, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
