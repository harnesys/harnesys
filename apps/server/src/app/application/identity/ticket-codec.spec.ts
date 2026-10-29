import { describe, expect, test } from 'bun:test';
import { signTicket, type TicketClaims, verifyTicket } from './ticket-codec.ts';

const secret = 'ticket-secret-key';
const now = 1_800_000_000_000;
const localNode = 'local-node';

function claims(overrides: Partial<TicketClaims> = {}): TicketClaims {
  return {
    v: 1,
    jti: 'jti-1',
    orgId: 'org-1',
    nodeId: localNode,
    userId: 'u-1',
    actions: ['terminal.open'],
    exp: Math.floor(now / 1000) + 30,
    iat: Math.floor(now / 1000),
    ...overrides,
  };
}

describe('ticket codec', () => {
  test('roundtrip, tampered payload and wrong key fail', async () => {
    const ticket = await signTicket(secret, claims());
    const roundtrip = await verifyTicket(secret, ticket, now, localNode);
    expect(roundtrip.ok).toBe(true);
    if (roundtrip.ok) {
      expect(roundtrip.claims.jti).toBe('jti-1');
      expect(roundtrip.claims.actions).toEqual(['terminal.open']);
    }
    const payload = ticket.slice(0, ticket.lastIndexOf('.'));
    const tampered = `${payload}x.${ticket.slice(ticket.lastIndexOf('.') + 1)}`;
    expect((await verifyTicket(secret, tampered, now, localNode)).ok).toBe(false);
    expect((await verifyTicket('other-key', ticket, now, localNode)).ok).toBe(false);
  });

  test('expired and wrong-node tickets fail', async () => {
    const expired = await signTicket(secret, claims({ exp: Math.floor(now / 1000) - 10 }));
    expect((await verifyTicket(secret, expired, now, localNode)).ok).toBe(false);
    const foreign = await signTicket(secret, claims({ nodeId: 'other-node' }));
    expect((await verifyTicket(secret, foreign, now, localNode)).ok).toBe(false);
  });
});
