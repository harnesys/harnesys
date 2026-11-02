import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { apiJson } from './client';

export type { TerminalSessionRecord };

function terminalsUrl(projectId: string): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active org');
  }
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(projectId)}/terminals`;
}

export function listOrgTerminals(orgId: string): Promise<TerminalSessionRecord[]> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/terminals`);
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

export function deleteOrgTerminal(sessionId: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active org');
  }
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/terminals/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

export function stopTerminal(projectId: string, sessionId: string): Promise<void> {
  return apiJson(`${terminalsUrl(projectId)}/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
  });
}

export function stopOrgTerminal(sessionId: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active org');
  }
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/terminals/${encodeURIComponent(sessionId)}/stop`,
    { method: 'POST' },
  );
}
