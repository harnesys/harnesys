import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export interface MemberView {
  userId: string;
  login: string;
  name: string;
  capabilities: string[];
  updatedAt: string;
}

export interface IssuedMemberInvite {
  inviteId: string;
  code: string;
}

export interface MemberPatchResult {
  userId: string;
  orgId: string;
  capabilities: string[];
  updatedAt: string;
}

export const MEMBER_CAPABILITIES = [
  'org.read',
  'org.update',
  'org.delete',
  'member.read',
  'member.invite',
  'member.manage',
  'fleet.read',
  'fleet.invite',
  'fleet.manage',
  'host.promote',
  'desk.read',
  'desk.write',
  'run.start',
  'run.cancel',
  'source.read',
  'source.write',
  'secret.read',
  'secret.write',
  'terminal.open',
  'agent.manage',
  'schedule.manage',
] as const;

export type MemberCapability = (typeof MEMBER_CAPABILITIES)[number];

export type InvitePreset = 'owner' | 'admin' | 'operator' | 'viewer' | 'custom';

export const INVITE_PRESETS: Record<
  'owner' | 'admin' | 'operator' | 'viewer',
  readonly MemberCapability[]
> = {
  owner: MEMBER_CAPABILITIES,
  admin: MEMBER_CAPABILITIES.filter((capability) => !isOwnerOnly(capability)),
  operator: MEMBER_CAPABILITIES.filter((capability) => isOperatorCapability(capability)),
  viewer: MEMBER_CAPABILITIES.filter((capability) => isViewerCapability(capability)),
};

function isOwnerOnly(capability: MemberCapability): boolean {
  return capability === 'org.delete' || capability === 'host.promote';
}

function isOperatorCapability(capability: MemberCapability): boolean {
  return !(
    capability.startsWith('secret.') ||
    capability.startsWith('member.') ||
    capability.startsWith('fleet.') ||
    capability === 'host.promote' ||
    capability === 'org.update' ||
    capability === 'org.delete'
  );
}

function isViewerCapability(capability: MemberCapability): boolean {
  return capability === 'org.read' || capability === 'desk.read' || capability === 'source.read';
}

export function membersQueryKey(orgId: string): readonly [string, string, string] {
  return ['orgs', orgId, 'members'] as const;
}

export function listMembers(orgId: string): Promise<MemberView[]> {
  return apiJson<MemberView[]>(`/api/orgs/${encodeURIComponent(orgId)}/members`);
}

export function membersQuery(orgId: string) {
  return queryOptions({
    queryKey: membersQueryKey(orgId),
    queryFn: () => listMembers(orgId),
    enabled: Boolean(orgId),
    staleTime: 5000,
  });
}

export function issueMemberInvite(
  orgId: string,
  capabilities: string[],
): Promise<IssuedMemberInvite> {
  return apiJson<IssuedMemberInvite>(`/api/orgs/${encodeURIComponent(orgId)}/members/invites`, {
    method: 'POST',
    body: JSON.stringify({ capabilities }),
  });
}

export function updateMember(
  orgId: string,
  userId: string,
  capabilities: string[],
): Promise<MemberPatchResult> {
  return apiJson<MemberPatchResult>(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify({ capabilities }) },
  );
}

export function removeMember(orgId: string, userId: string): Promise<void> {
  return apiJson<void>(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export interface ResetMemberPasswordResult {
  userId: string;
  temporaryPassword: string;
}

export function resetMemberPassword(
  orgId: string,
  userId: string,
): Promise<ResetMemberPasswordResult> {
  return apiJson<ResetMemberPasswordResult>(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/reset-password`,
    { method: 'POST' },
  );
}

export interface AcceptedMemberInvite {
  userId: string;
  orgId: string;
}

export function acceptMemberInvite(input: {
  code: string;
  login: string;
  password: string;
}): Promise<AcceptedMemberInvite> {
  return apiJson<AcceptedMemberInvite>('/api/invites/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
