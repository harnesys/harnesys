import type { OrgLspEntry } from '@harnesys/contracts';

export function extensionOfPath(path: string): string | undefined {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return undefined;
  }
  return base.slice(dot + 1).toLowerCase();
}

export function normalizeExtension(key: string): string {
  return key.replace(/^\.+/, '').toLowerCase();
}

export function matchesPathExtensions(
  extensionToLanguage: Record<string, string>,
  path: string,
): boolean {
  const extension = extensionOfPath(path);
  if (!extension) {
    return false;
  }
  return Object.keys(extensionToLanguage).some((key) => normalizeExtension(key) === extension);
}

export function findServersForPath(servers: OrgLspEntry[], path: string): OrgLspEntry[] {
  return servers.filter((server) => matchesPathExtensions(server.extensionToLanguage, path));
}
