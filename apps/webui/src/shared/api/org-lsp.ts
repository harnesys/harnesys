import type { OrgLspListResponse } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';
import { readSse } from './sse';

export type { OrgLspListResponse };

function orgLspBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/lsp`;
}

function sourceLspBase(orgId: string, sourceId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/lsp`;
}

export function orgLspQueryKey(orgId: string) {
  return ['orgs', orgId, 'lsp'] as const;
}

export function sourceLspQueryKey(orgId: string, sourceId: string) {
  return ['orgs', orgId, 'sources', sourceId, 'lsp'] as const;
}

export function getOrgLsp(orgId: string) {
  return apiJson<OrgLspListResponse>(orgLspBase(orgId));
}

export function orgLspQuery(orgId: string) {
  return queryOptions({
    queryKey: orgLspQueryKey(orgId),
    queryFn: () => getOrgLsp(orgId),
    enabled: Boolean(orgId),
  });
}

export function putOrgLsp(orgId: string, body: unknown) {
  return apiJson<OrgLspListResponse>(orgLspBase(orgId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function restartOrgLspServer(orgId: string, serverId: string) {
  return apiJson<OrgLspListResponse>(
    `${orgLspBase(orgId)}/${encodeURIComponent(serverId)}/restart`,
    { method: 'POST' },
  );
}

export function stopOrgLspServer(orgId: string, serverId: string) {
  return apiJson<OrgLspListResponse>(`${orgLspBase(orgId)}/${encodeURIComponent(serverId)}/stop`, {
    method: 'POST',
  });
}

export function enableOrgLspServer(orgId: string, serverId: string) {
  return apiJson<OrgLspListResponse>(
    `${orgLspBase(orgId)}/${encodeURIComponent(serverId)}/enable`,
    { method: 'POST' },
  );
}

export function getSourceLsp(orgId: string, sourceId: string) {
  return apiJson<OrgLspListResponse>(sourceLspBase(orgId, sourceId));
}

export function sourceLspQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: sourceLspQueryKey(orgId, sourceId),
    queryFn: () => getSourceLsp(orgId, sourceId),
    enabled: Boolean(orgId && sourceId),
  });
}

export function putSourceLsp(orgId: string, sourceId: string, body: unknown) {
  return apiJson<OrgLspListResponse>(sourceLspBase(orgId, sourceId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export interface LspQueryInput {
  sourceId: string;
  path: string;
  line?: number;
  character?: number;
}

export interface OrgLspDiagnostic {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  source?: string;
  code?: string;
}

export interface OrgLspDiagnosticsFrame {
  orgId: string;
  cwd: string;
  serverId: string;
  diagnostics: OrgLspDiagnostic[];
}

function lspQueryBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/lsp`;
}

function lspQuery<T>(orgId: string, method: string, input: LspQueryInput): Promise<T> {
  return apiJson<T>(`${lspQueryBase(orgId)}/${method}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function lspDiagnostics(orgId: string, input: LspQueryInput) {
  return lspQuery<OrgLspDiagnostic[]>(orgId, 'diagnostics', input);
}

export function lspHover(orgId: string, input: LspQueryInput) {
  return lspQuery<unknown>(orgId, 'hover', input);
}

export function lspDefinition(orgId: string, input: LspQueryInput) {
  return lspQuery<unknown[]>(orgId, 'definition', input);
}

export function lspReferences(orgId: string, input: LspQueryInput) {
  return lspQuery<unknown[]>(orgId, 'references', input);
}

export function openOrgLspEvents(
  orgId: string,
  sourceId: string,
  onFrame: (frame: OrgLspDiagnosticsFrame) => void,
): () => void {
  const controller = new AbortController();
  void lspEventStream(orgId, sourceId, onFrame, controller);
  return () => controller.abort();
}

async function lspEventStream(
  orgId: string,
  sourceId: string,
  onFrame: (frame: OrgLspDiagnosticsFrame) => void,
  controller: AbortController,
): Promise<void> {
  let attempt = 0;
  while (!controller.signal.aborted) {
    try {
      const response = await authenticatedFetch(
        apiUrl(`${lspQueryBase(orgId)}/events?sourceId=${encodeURIComponent(sourceId)}`),
        { headers: { Accept: 'text/event-stream' }, signal: controller.signal },
      );
      if (!response.ok || !response.body) {
        throw new Error(`lsp events open failed ${response.status}`);
      }
      attempt = 0;
      for await (const frame of readSse(response)) {
        if (frame.event !== 'message') {
          continue;
        }
        try {
          onFrame(JSON.parse(frame.data) as OrgLspDiagnosticsFrame);
        } catch {}
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, nextLspBackoff(attempt)));
    attempt += 1;
  }
}

function nextLspBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}
