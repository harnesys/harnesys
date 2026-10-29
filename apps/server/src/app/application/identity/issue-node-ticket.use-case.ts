import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, ValidationException } from '@harnesys/brix';
import { NodeNotFoundException } from '../../domain/fleet/fleet.error.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';
import { signTicket, type TicketClaims } from './ticket-codec.ts';

const DEFAULT_TICKET_TTL_SEC = 30;
const TERMINAL_TICKET_TTL_SEC = 60;

export interface IssueNodeTicketInput {
  principal: Principal;
  orgId: string;
  nodeId?: string;
  actions: string[];
  ttlSec?: number;
  now?: string;
}

export interface IssuedNodeTicket {
  ticket: string;
  expiresAt: string;
}

@Injectable()
export class IssueNodeTicketUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly keys: TicketKeyStore,
    private readonly audit: IdentityAudit,
    private readonly machineConfig: MachineConfigPort,
    private readonly orgs: OrgMachineStore,
  ) {}

  async execute(input: IssueNodeTicketInput): Promise<IssuedNodeTicket> {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('Tickets are issued to user sessions only');
    }
    if (input.actions.length === 0) {
      throw new ValidationException('actions must be non-empty');
    }
    for (const action of input.actions) {
      if (!authorize(input.principal, action, { orgId: input.orgId })) {
        throw new ForbiddenException(`Action is not allowed: ${action}`);
      }
    }
    if (!this.orgs.get(input.orgId)) {
      throw new ValidationException('org is not hosted by this relay');
    }
    const ttlSec = input.ttlSec ?? ticketTtlSec(input.actions);
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
      throw new ValidationException('ttlSec must be a positive number');
    }
    const targetNodeId = input.nodeId?.trim() || this.machineConfig.get().id;
    if (targetNodeId !== this.machineConfig.get().id) {
      const node = this.nodes.findById(input.orgId, targetNodeId);
      if (!node) {
        throw new NodeNotFoundException(targetNodeId);
      }
    }
    const at = input.now ?? new Date().toISOString();
    const nowSec = Math.floor(Date.parse(at) / 1000);
    const claims: TicketClaims = {
      v: 1,
      jti: randomUUID(),
      orgId: input.orgId,
      nodeId: targetNodeId,
      userId: input.principal.userId,
      actions: input.actions,
      exp: nowSec + ttlSec,
      iat: nowSec,
    };
    const ticket = await signTicket(this.keys.ensure(input.orgId), claims);
    this.audit.append(
      identityAuditRow(at, {
        actorKind: 'user',
        actorId: input.principal.userId,
        action: 'ticket_issued',
        result: 'ok',
        reason: targetNodeId,
      }),
    );
    return { ticket, expiresAt: new Date((nowSec + ttlSec) * 1000).toISOString() };
  }
}

function ticketTtlSec(actions: string[]): number {
  return actions.includes('terminal.open') ? TERMINAL_TICKET_TTL_SEC : DEFAULT_TICKET_TTL_SEC;
}
