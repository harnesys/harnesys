import { parseTicketPayload, type TicketClaims, verifyTicket } from './ticket-codec.ts';

export type VerifyNodeTicketReason =
  | 'bad-signature'
  | 'expired'
  | 'wrong-node'
  | 'consumed'
  | 'missing-action';

export interface VerifyNodeTicketInput {
  key: string;
  ticket: string;
  nowMs: number;
  localNodeId: string;
  requiredActions: readonly string[];
  isConsumed: (jti: string) => boolean;
}

export type VerifyNodeTicketResult =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: VerifyNodeTicketReason };

export async function verifyNodeTicket(
  input: VerifyNodeTicketInput,
): Promise<VerifyNodeTicketResult> {
  const decoded = parseTicketPayload(input.ticket);
  if (!decoded) {
    return { ok: false, reason: 'bad-signature' };
  }
  const verified = await verifyTicket(input.key, input.ticket, input.nowMs, input.localNodeId);
  if (!verified.ok) {
    if (decoded.exp * 1000 <= input.nowMs) {
      return { ok: false, reason: 'expired' };
    }
    if (decoded.nodeId !== input.localNodeId) {
      return { ok: false, reason: 'wrong-node' };
    }
    return { ok: false, reason: 'bad-signature' };
  }
  if (input.isConsumed(decoded.jti)) {
    return { ok: false, reason: 'consumed' };
  }
  if (!input.requiredActions.every((action) => verified.claims.actions.includes(action))) {
    return { ok: false, reason: 'missing-action' };
  }
  return verified;
}
