import type { OrgLspEntry } from '@harnesys/contracts';
import { getActiveOrgId } from '@/shared/api/active-org';
import { getOrgLsp, restartOrgLspServer } from '@/shared/api/org-lsp';

export async function restartLspForPath(orgId: string, path: string): Promise<void> {
  const list = await getOrgLsp(orgId);
  const serverId = findServersForPath(list.servers, path)[0]?.serverId;
  if (!serverId) {
    throw new Error(`no LSP server for file: ${path}`);
  }
  await restartOrgLspServer(orgId, serverId);
}

export async function restartLspForActiveOrg(path: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('no active org');
  }
  await restartLspForPath(orgId, path);
}

export function findServersForPath(servers: OrgLspEntry[], path: string): OrgLspEntry[] {
  const ext = extensionOf(path);
  if (!ext) {
    return [];
  }
  return servers.filter((server) =>
    Object.keys(server.extensionToLanguage).some((key) => normalizeExtension(key) === ext),
  );
}

function extensionOf(path: string): string | undefined {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return undefined;
  }
  return base.slice(dot + 1).toLowerCase();
}

function normalizeExtension(key: string): string {
  return key.replace(/^\.+/, '').toLowerCase();
}
