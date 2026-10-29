import type { CreateTeamBody, CreateTeamResponse } from '@harnesys/contracts';
import { apiJson } from './client';

export type { CreateTeamBody, CreateTeamResponse };

function orgBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}`;
}

export function createTeam(orgId: string, body: CreateTeamBody): Promise<CreateTeamResponse> {
  return apiJson<CreateTeamResponse>(`${orgBase(orgId)}/teams`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
