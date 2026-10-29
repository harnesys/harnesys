import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export interface MySessionView {
  familyId: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function mySessionsQueryKey(): readonly [string, string] {
  return ['session', 'sessions'] as const;
}

export function listMySessions(): Promise<MySessionView[]> {
  return apiJson<MySessionView[]>('/api/session/sessions');
}

export function mySessionsQuery() {
  return queryOptions({
    queryKey: mySessionsQueryKey(),
    queryFn: () => listMySessions(),
    staleTime: 5000,
  });
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiJson<void>('/api/session/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeMySession(familyId: string): Promise<void> {
  return apiJson<void>('/api/session/revoke', {
    method: 'POST',
    body: JSON.stringify({ familyId }),
  });
}

export function revokeAllMySessions(): Promise<void> {
  return apiJson<void>('/api/session/revoke-all', { method: 'POST' });
}
