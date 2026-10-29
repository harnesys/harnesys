import { ForbiddenException } from '@harnesys/brix';
import type { RunAttribution, RunVia } from 'harnesys';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { orgAuditRow } from '../fleet/org-audit-row.ts';
import type { RunAttributionNames } from './thread.helpers.ts';

export interface RunStartAttribution {
  startedByUserId?: string;
  via: RunVia;
}

export function userRunStart(principal: Principal): RunStartAttribution {
  if (principal.kind !== 'user') {
    return { via: 'agent' };
  }
  return { startedByUserId: principal.userId, via: 'direct' };
}

export function principalUserId(principal: Principal | undefined): string | null {
  return principal && principal.kind === 'user' ? principal.userId : null;
}

export function mechanicalRunStart(ownerUserId: string | null): RunStartAttribution {
  return ownerUserId ? { startedByUserId: ownerUserId, via: 'agent' } : { via: 'agent' };
}

export function recordOwnerOnWrite(
  current: string | null,
  actorUserId: string | null,
): string | null {
  return current ?? actorUserId;
}

export function assertRunStart(attribution: RunStartAttribution | undefined): void {
  if (!attribution) {
    throw new ForbiddenException('run start carries no attribution');
  }
  if (attribution.via === 'direct' && !attribution.startedByUserId) {
    throw new ForbiddenException('direct run start requires a user principal');
  }
}

export function attributedRun(
  attribution: RunStartAttribution,
  onNodeId: string | null,
): RunAttribution {
  return {
    startedByUserId: attribution.startedByUserId,
    via: attribution.via,
    onNodeId,
  };
}

export function runAttributionNamesOf(
  users: UserRepository,
  nodes: NodeRepository,
  orgId: string,
): RunAttributionNames {
  const userNames = new Map<string, string | undefined>();
  const nodeNames = new Map<string, string | undefined>();
  return {
    userNameOf: (userId) => {
      if (!userNames.has(userId)) {
        userNames.set(userId, users.findById(userId)?.name);
      }
      return userNames.get(userId);
    },
    nodeNameOf: (nodeId) => {
      if (!nodeNames.has(nodeId)) {
        nodeNames.set(nodeId, nodes.findById(orgId, nodeId)?.name);
      }
      return nodeNames.get(nodeId);
    },
  };
}

export function auditRunStart(
  audit: OrgAudit,
  input: {
    orgId: string;
    runId: string;
    attribution: RunAttribution;
    triggerId: string;
  },
): void {
  audit.append(
    input.orgId,
    orgAuditRow(new Date().toISOString(), {
      actorKind: input.attribution.startedByUserId ? 'user' : 'machine',
      actorId: input.attribution.startedByUserId ?? input.triggerId,
      viaNodeId: input.attribution.onNodeId ?? null,
      action: 'run_started',
      resource: input.runId,
      result: 'accepted',
    }),
  );
}
