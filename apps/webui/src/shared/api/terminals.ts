import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { apiJson } from './client';

export type { TerminalSessionRecord };

export function terminalsQueryKey(projectId: string) {
  return ['terminals', projectId] as const;
}

function terminalsUrl(projectId: string): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active org');
  }
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(projectId)}/terminals`;
}

export function listTerminals(projectId: string): Promise<TerminalSessionRecord[]> {
  return apiJson(terminalsUrl(projectId));
}

export function createTerminal(projectId: string, cwd?: string): Promise<TerminalSessionRecord> {
  return apiJson(terminalsUrl(projectId), {
    method: 'POST',
    body: JSON.stringify(cwd ? { cwd } : {}),
  });
}

export function deleteTerminal(projectId: string, sessionId: string): Promise<void> {
  return apiJson(`${terminalsUrl(projectId)}/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
