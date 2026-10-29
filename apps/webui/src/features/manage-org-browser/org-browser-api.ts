import type { BrowserDefaultEngine } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import type { EngineSpec, HostEngineEntry } from 'harnesys';
import { getActiveOrgId } from '@/shared/api/active-org';
import { apiJson, apiUrl } from '@/shared/api/client';
import { authenticatedFetch } from '@/shared/api/session';
import { readSse } from '@/shared/api/sse';

export type { BrowserDefaultEngine, EngineSpec, HostEngineEntry };

export interface OrgBrowserHostView {
  hostId: string;
  entries: HostEngineEntry[];
  agentBrowserPath: string | null;
  agentBrowserVersion: string | null;
  agentBrowserCommands: string[];
}

export interface AgentBrowserUpdateCheck {
  installed: string | null;
  latest: string;
  updateAvailable: boolean;
}

export interface AgentBrowserToolInstallResult {
  path: string;
  version: string;
  commands: string[];
}

export interface BrowserVersionOption {
  version: string;
  sha256: string | null;
  supported: boolean;
  recommended: boolean;
}

export interface OrgBrowserView {
  engines: EngineSpec[];
  hosts: OrgBrowserHostView[];
  defaultEngine: BrowserDefaultEngine;
}

export interface BrowserInstallProgress {
  phase: 'download' | 'verify' | 'extract' | 'done';
  receivedBytes?: number;
  totalBytes?: number;
}

export interface BrowserInstallInput {
  hostId: string;
  engine: string;
  stealth: boolean;
  version?: string;
}

function orgBrowserBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/browser`;
}

export function orgBrowserQueryKey(orgId: string) {
  return ['orgs', orgId, 'browser'] as const;
}

export function getOrgBrowser(orgId: string) {
  return apiJson<OrgBrowserView>(orgBrowserBase(orgId));
}

export function orgBrowserQuery(orgId: string) {
  return queryOptions({
    queryKey: orgBrowserQueryKey(orgId),
    queryFn: () => getOrgBrowser(orgId),
    enabled: Boolean(orgId),
  });
}

export function putOrgBrowserSettings(orgId: string, defaultEngine: BrowserDefaultEngine) {
  return apiJson<{ defaultEngine: BrowserDefaultEngine }>(`${orgBrowserBase(orgId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify({ defaultEngine }),
  });
}

export function postOrgBrowserAllowlist(orgId: string, hostId: string, engineId: string) {
  return apiJson<unknown>(`${orgBrowserBase(orgId)}/allowlist`, {
    method: 'POST',
    body: JSON.stringify({ hostId, engineId }),
  });
}

export function putOrgBrowserEngineState(
  orgId: string,
  engineId: string,
  hostId: string,
  enabled: boolean,
) {
  return apiJson<unknown>(
    `${orgBrowserBase(orgId)}/engines/${encodeURIComponent(engineId)}/state`,
    {
      method: 'PUT',
      body: JSON.stringify({ hostId, enabled }),
    },
  );
}

export function deleteOrgBrowserEngine(orgId: string, engineId: string, hostId: string) {
  return apiJson<unknown>(
    `${orgBrowserBase(orgId)}/engines/${encodeURIComponent(engineId)}?hostId=${encodeURIComponent(hostId)}`,
    { method: 'DELETE' },
  );
}

export function postOrgBrowserAgentBrowserInstall(orgId: string, hostId: string, version?: string) {
  return apiJson<AgentBrowserToolInstallResult>(
    `${orgBrowserBase(orgId)}/tools/agent-browser/install`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId, version }),
    },
  );
}

export function postOrgBrowserAgentBrowserUpdateCheck(orgId: string, hostId: string) {
  return apiJson<AgentBrowserUpdateCheck>(
    `${orgBrowserBase(orgId)}/tools/agent-browser/check-update`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId }),
    },
  );
}

export function orgEngineVersionsQuery(
  orgId: string,
  hostId: string,
  engineId: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ['orgs', orgId, 'browser', 'versions', hostId, engineId] as const,
    queryFn: () =>
      apiJson<{ versions: BrowserVersionOption[] }>(
        `${orgBrowserBase(orgId)}/engines/${encodeURIComponent(engineId)}/versions?hostId=${encodeURIComponent(hostId)}`,
      ),
    enabled,
  });
}

interface SseErrorFrame {
  message: string;
}

function parseSseData<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

export async function installOrgBrowserEngine(
  orgId: string,
  input: BrowserInstallInput,
  onProgress: (progress: BrowserInstallProgress) => void,
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const orgHeader = getActiveOrgId();
  if (orgHeader) {
    headers.set('X-Org-Id', orgHeader);
  }
  const response = await authenticatedFetch(apiUrl(`${orgBrowserBase(orgId)}/install`), {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`install failed ${response.status}`);
  }
  for await (const frame of readSse(response)) {
    if (frame.event === 'progress') {
      const progress = parseSseData<BrowserInstallProgress>(frame.data);
      if (progress) {
        onProgress(progress);
      }
      continue;
    }
    if (frame.event === 'error') {
      const failure = parseSseData<SseErrorFrame>(frame.data);
      throw new Error(failure?.message ?? 'install failed');
    }
    if (frame.event === 'done') {
      return;
    }
  }
}
