export abstract class TicketKeyStore {
  abstract get(orgId: string): string | null;
  abstract ensure(orgId: string): string;
  abstract rotate(orgId: string): string;
}
