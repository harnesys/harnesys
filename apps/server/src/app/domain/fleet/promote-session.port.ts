export interface PromoteSession {
  token: string;
  orgId: string;
  targetNodeId: string;
  newRelayUrl: string;
  sourceNodeId: string;
  sourceNodeName: string;
  sourceToken: string;
  expiresAt: string;
}

export abstract class PromoteSessionStore {
  abstract create(session: PromoteSession): void;
  abstract get(token: string): PromoteSession | null;
  abstract consume(token: string): PromoteSession | null;
}
