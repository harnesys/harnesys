import type { JsonObject } from '@harnesys/sdk';

export interface AddonAuditActor {
  kind: 'user' | 'system' | 'host';
  id: string;
}

export type AddonAuditOutcome = 'ok' | 'denied' | 'failed';

export interface AddonAuditEntry {
  at?: string;
  actor: AddonAuditActor;
  action: string;
  target: string;
  outcome: AddonAuditOutcome;
  details?: JsonObject;
}

export abstract class AddonAuditPort {
  abstract append(orgId: string, entry: AddonAuditEntry): void;
}
