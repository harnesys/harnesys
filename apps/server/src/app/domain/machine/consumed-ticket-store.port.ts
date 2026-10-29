export abstract class ConsumedTicketStore {
  abstract has(orgId: string, jti: string): boolean;
  abstract consume(orgId: string, jti: string, expiresAtSec: number): void;
}
