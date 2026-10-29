import { Injectable, UnauthorizedException } from '@harnesys/brix';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { ConsumedTicketStore } from '../../domain/machine/consumed-ticket-store.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import type { TicketClaims } from './ticket-codec.ts';
import { verifyNodeTicket } from './verify-node-ticket.ts';

export const TICKET_QUERY_NAME = 'ticket';
export const TICKET_HEADER_NAME = 'X-Harnesys-Ticket';

export interface VerifiedNodeTicket {
  orgId: string;
  claims: TicketClaims;
}

export function ticketCredentialOf(request: Request): string | null {
  const header = request.headers.get(TICKET_HEADER_NAME);
  if (header?.trim()) {
    return header.trim();
  }
  const url = new URL(request.url);
  return url.searchParams.get(TICKET_QUERY_NAME);
}

@Injectable()
export class NodeTicketAccess {
  constructor(
    private readonly identities: NodeIdentityStore,
    private readonly keys: TicketKeyStore,
    private readonly orgs: OrgMachineStore,
    private readonly machine: MachineConfigPort,
    private readonly consumed: ConsumedTicketStore,
  ) {}

  async verify(input: {
    ticket: string;
    orgId: string | null;
    requiredActions: readonly string[];
    nowMs?: number;
  }): Promise<VerifiedNodeTicket> {
    const nowMs = input.nowMs ?? Date.now();
    const localNodeId = this.machine.get().id;
    const contexts = this.ticketContexts(input.orgId);
    if (contexts.length === 0) {
      throw new UnauthorizedException('no ticket key for the org on this machine');
    }
    let reason: string | null = null;
    for (const context of contexts) {
      const outcome = await verifyNodeTicket({
        key: context.key,
        ticket: input.ticket,
        nowMs,
        localNodeId,
        requiredActions: input.requiredActions,
        isConsumed: (jti) => this.consumed.has(context.orgId, jti),
      });
      if (outcome.ok) {
        return { orgId: context.orgId, claims: outcome.claims };
      }
      reason = outcome.reason;
    }
    throw new UnauthorizedException(`ticket rejected (${reason ?? 'invalid'})`);
  }

  consume(verified: VerifiedNodeTicket): void {
    this.consumed.consume(verified.orgId, verified.claims.jti, verified.claims.exp);
  }

  private ticketContexts(orgId: string | null): Array<{ orgId: string; key: string }> {
    const contexts: Array<{ orgId: string; key: string }> = [];
    if (orgId) {
      const key = this.ticketKeyFor(orgId);
      if (key) {
        contexts.push({ orgId, key });
      }
      return contexts;
    }
    for (const entry of this.orgs.list()) {
      const key = this.ticketKeyFor(entry.orgId);
      if (key) {
        contexts.push({ orgId: entry.orgId, key });
      }
    }
    return contexts;
  }

  private ticketKeyFor(orgId: string): string | null {
    const identity = this.identities.read(orgId);
    return identity?.ticketKey ?? this.keys.get(orgId);
  }
}
