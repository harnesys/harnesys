import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@harnesys/brix';
import type { ClaimWorkBody, ClaimWorkResponse, TaskEnvelope } from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { WORK_CLAIM_LEASE_SEC } from '../../domain/fleet/work-claim.constants.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface ClaimWorkInput {
  orgId: string;
  bearerToken: string;
  body: ClaimWorkBody;
}

@Injectable()
export class ClaimWorkUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly events: FleetEventsPort,
  ) {}

  execute(input: ClaimWorkInput): ClaimWorkResponse {
    const token = input.bearerToken.trim();
    if (!token) {
      throw new UnauthorizedException('node token required');
    }
    const row = this.nodes.findByTokenHash(input.orgId, hashNodeToken(token));
    if (!row || row.id !== input.body.nodeId) {
      throw new UnauthorizedException('node unauthorized');
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: row.id, orgId: input.orgId };
    if (!authorize(principal, 'work.claim')) {
      throw new ForbiddenException('work.claim action is required for nodes');
    }
    const now = new Date().toISOString();
    const queued = this.commands.list(input.orgId, row.id);
    for (const item of queued) {
      if (item.command.type !== 'RUN_PLACE') {
        continue;
      }
      const envelope = item.command.envelope;
      const leaseUntil = new Date(Date.now() + WORK_CLAIM_LEASE_SEC * 1000).toISOString();
      const claimed = this.claims.grant({
        orgId: input.orgId,
        runId: envelope.runId,
        nodeId: row.id,
        leaseEpoch: envelope.leaseEpoch,
        leaseUntil,
        token: randomUUID(),
      });
      if (!claimed) {
        continue;
      }
      this.events.emit(input.orgId);
      this.commands.remove(input.orgId, item.id);
      const next: TaskEnvelope = {
        ...envelope,
        expiresAt: leaseUntil,
      };
      assertNamesOnly(next);
      return { envelope: next };
    }
    const active = this.claims.findActiveByNode(input.orgId, row.id, now);
    if (active.length === 0) {
      return { envelope: null };
    }
    return { envelope: null };
  }
}

function assertNamesOnly(envelope: TaskEnvelope): void {
  const json = JSON.stringify(envelope);
  if (/"values"\s*:/.test(json)) {
    throw new Error('task envelope must not include secret values');
  }
}
