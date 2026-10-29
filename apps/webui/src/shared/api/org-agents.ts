import type { AgentOrgRecord, AssignmentRecord, OrgRecord } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export interface OrgSummary {
  org: OrgRecord;
  agentsCount: number;
  projectsCount: number;
}
export interface CreateOrgAgentInput {
  name: string;
  role: string;
  instructions: string;
  model: string;
}
export interface UpdateOrgAgentInput {
  name?: string;
  role?: string;
  instructions?: string;
  model?: string;
}
export interface GrantOrgAssignmentInput {
  projectId: string;
  enabled?: boolean;
}
export interface StartAgentRunInput {
  text: string;
  title?: string;
}
export interface StartedAgentRun {
  agentId: string;
  threadId: string;
  runId: string;
  projectId: string | null;
  sandboxDir: string | null;
}
export function startAgentRun(agentId: string, body: StartAgentRunInput) {
  return apiJson<StartedAgentRun>(`/api/org/agents/${agentId}/run`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function getOrgSummary() {
  return apiJson<OrgSummary>('/api/org');
}
export function listOrgAgents() {
  return apiJson<AgentOrgRecord[]>('/api/org/agents');
}
export function createOrgAgent(body: CreateOrgAgentInput) {
  return apiJson<AgentOrgRecord>('/api/org/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updateOrgAgent(agentId: string, body: UpdateOrgAgentInput) {
  return apiJson<AgentOrgRecord>(`/api/org/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function archiveOrgAgent(agentId: string) {
  return apiJson<void>(`/api/org/agents/${agentId}`, {
    method: 'DELETE',
  });
}
export function listOrgAssignments(agentId: string) {
  return apiJson<AssignmentRecord[]>(`/api/org/agents/${agentId}/assignments`);
}
export function grantOrgAssignment(agentId: string, body: GrantOrgAssignmentInput) {
  return apiJson<AssignmentRecord>(`/api/org/agents/${agentId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function revokeOrgAssignment(agentId: string, projectId: string) {
  return apiJson<void>(`/api/org/agents/${agentId}/assignments/${projectId}`, {
    method: 'DELETE',
  });
}
export const orgSummaryQueryKey = ['org-summary'] as const;
export const orgAgentsQueryKey = ['org-agents'] as const;
export const orgAssignmentsQueryKey = ['org-assignments'] as const;
export function orgAssignmentsQueryKeyFor(agentId: string) {
  return [...orgAssignmentsQueryKey, agentId] as const;
}
export const orgSummaryQuery = queryOptions({
  queryKey: orgSummaryQueryKey,
  queryFn: getOrgSummary,
});
export const orgAgentsQuery = queryOptions({
  queryKey: orgAgentsQueryKey,
  queryFn: listOrgAgents,
});
export function orgAssignmentsQuery(agentId: string) {
  return queryOptions({
    queryKey: orgAssignmentsQueryKeyFor(agentId),
    queryFn: () => listOrgAssignments(agentId),
  });
}
