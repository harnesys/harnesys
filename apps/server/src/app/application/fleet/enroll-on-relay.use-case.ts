import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, ValidationException } from '@harnesys/brix';
import type { EnrollResponse } from '@harnesys/contracts';
import {
  InviteInvalidException,
  NodeNameTakenException,
  NotRelayOrgException,
} from '../../domain/fleet/fleet.error.ts';
import { InviteRepository } from '../../domain/fleet/invite-repository.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { hashNodeToken } from './hash-node-token.ts';
import { orgAuditRow } from './org-audit-row.ts';

export interface EnrollOnRelayInput {
  orgId: string;
  code: string;
  nodeName: string;
  nodeId?: string;
}

@Injectable()
export class EnrollOnRelayUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly nodes: NodeRepository,
    private readonly store: OrgMachineStore,
    private readonly keys: TicketKeyStore,
    private readonly audit: OrgAudit,
  ) {}

  execute(input: EnrollOnRelayInput): EnrollResponse {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(input.orgId);
    }
    const cleanCode = input.code.trim().toUpperCase();
    if (!cleanCode) {
      throw new InviteInvalidException();
    }
    const invite = this.invites.findByCode(input.orgId, cleanCode);
    if (!invite || invite.usedAt !== null || Date.parse(invite.expiresAt) <= Date.now()) {
      throw new InviteInvalidException();
    }
    const name = input.nodeName.trim() === '' ? invite.nodeName : input.nodeName.trim();
    if (!name) {
      throw new ValidationException('nodeName is required');
    }
    if (this.nodes.findByName(input.orgId, name)) {
      throw new NodeNameTakenException(name);
    }
    const nodeId =
      input.nodeId !== undefined && input.nodeId.trim() !== '' ? input.nodeId.trim() : randomUUID();
    const token = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    this.nodes.insert(input.orgId, {
      id: nodeId,
      name,
      role: 'worker',
      tokenHash: hashNodeToken(token),
      enrolledAt: now,
      status: 'offline',
      lastSeenAt: null,
    });
    this.invites.markUsed(input.orgId, invite.id, now);
    const ticketKey = this.keys.ensure(input.orgId);
    this.audit.append(
      input.orgId,
      orgAuditRow(now, {
        actorKind: 'public',
        actorId: '',
        viaNodeId: null,
        action: 'node_enrolled',
        resource: nodeId,
        result: 'ok',
      }),
    );
    const orgName = this.nodes.readOrgName(input.orgId) ?? entry.name;
    return {
      nodeId,
      token,
      ticketKey,
      orgId: input.orgId,
      orgName,
      description: entry.description ?? '',
    };
  }
}
