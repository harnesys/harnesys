import { getActiveOrgId } from './active-org';
import { apiJson } from './client';

function requireOrgId(): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('org not set');
  }
  return orgId;
}

export interface RawRequestCallMeta {
  ts: number;
  provider: string;
  model: string;
  mode: string;
  runId?: string;
  usage?: Record<string, number>;
}

export interface RawRequestPlanSection {
  id: string;
  chars: number;
  estTokens: number;
}

export interface RawRequestPlan {
  sections: RawRequestPlanSection[];
  totalChars: number;
  totalEstTokens: number;
}

export interface RawRequestCallSummary {
  name: string;
  meta?: RawRequestCallMeta;
  plan?: RawRequestPlan;
  summary?: { messageCount: number; toolNames: string[] };
  truncated?: boolean;
}

export interface RawRequestCallPayload {
  name: string;
  meta?: RawRequestCallMeta;
  plan?: RawRequestPlan;
  request?: unknown;
}

export async function listThreadRawModelRequests(
  threadId: string,
): Promise<RawRequestCallSummary[]> {
  requireOrgId();
  const res = await apiJson<{ items: RawRequestCallSummary[] }>(
    `/api/threads/${encodeURIComponent(threadId)}/raw-model-requests`,
  );
  return res.items;
}

export async function getThreadRawModelRequest(
  threadId: string,
  name: string,
): Promise<RawRequestCallPayload> {
  requireOrgId();
  return apiJson<RawRequestCallPayload>(
    `/api/threads/${encodeURIComponent(threadId)}/raw-model-requests/${encodeURIComponent(name)}`,
  );
}

export interface RunUsage {
  runId: string;
  tokens: number;
  costUsd: number;
}

export async function getRunUsage(runId: string): Promise<RunUsage> {
  const orgId = requireOrgId();
  return apiJson<RunUsage>(`/api/orgs/${orgId}/usage/runs/${encodeURIComponent(runId)}`);
}
