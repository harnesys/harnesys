import { getActiveOrgId } from '@/shared/api/active-org';
import { getOrgLsp, restartOrgLspServer } from '@/shared/api/org-lsp';
import { findServersForPath } from './lsp-path';

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
