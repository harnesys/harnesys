import { apiJson } from './client';

export interface NodeTicketGrant {
  ticket: string;
  expiresAt: string;
}

export function requestNodeTicket(actions: string[]): Promise<NodeTicketGrant> {
  return apiJson<NodeTicketGrant>('/api/session/ticket', {
    method: 'POST',
    body: JSON.stringify({ actions }),
  });
}
