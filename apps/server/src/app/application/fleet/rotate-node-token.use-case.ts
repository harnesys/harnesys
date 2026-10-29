import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable } from '@harnesys/brix';
import type { RotateNodeTokenResponse } from '@harnesys/contracts';
import { FleetNodeMissingException } from '../../domain/fleet/fleet.error.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { hashNodeToken } from './hash-node-token.ts';
import { orgAuditRow } from './org-audit-row.ts';

export interface RotateNodeTokenInput {
  principal: Principal;
  orgId: string;
  nodeId: string;
}

@Injectable()
export class RotateNodeTokenUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly keys: TicketKeyStore,
    private readonly audit: OrgAudit,
  ) {}

  execute(input: RotateNodeTokenInput): RotateNodeTokenResponse {
    if (!authorize(input.principal, 'fleet.manage', { orgId: input.orgId })) {
      throw new ForbiddenException('fleet.manage capability is required');
    }
    const node = this.nodes.findById(input.orgId, input.nodeId);
    if (!node) {
      throw new FleetNodeMissingException(input.nodeId);
    }
    const token = randomBytes(32).toString('base64url');
    this.nodes.updateRoleAndToken(input.orgId, input.nodeId, {
      role: node.role,
      tokenHash: hashNodeToken(token),
    });
    const ticketKey = this.keys.rotate(input.orgId);
    this.audit.append(
      input.orgId,
      orgAuditRow(new Date().toISOString(), {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        viaNodeId: null,
        action: 'node_rotated',
        resource: input.nodeId,
        result: 'ok',
      }),
    );
    return { nodeId: input.nodeId, token, ticketKey };
  }
}
