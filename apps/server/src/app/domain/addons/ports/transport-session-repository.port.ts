import type { TransportSessionPatch, TransportSessionRow } from '../transport-session.ts';

export abstract class AddonTransportSessionRepositoryPort {
  abstract find(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
  ): TransportSessionRow | null;

  abstract findParked(
    orgId: string,
    addonId: string,
    externalChatId: string,
  ): TransportSessionRow | null;

  abstract open(row: TransportSessionRow): void;

  abstract listOpen(): TransportSessionRow[];

  abstract patch(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
    patch: TransportSessionPatch,
  ): void;

  abstract removeAddon(orgId: string, addonId: string): void;

  abstract rememberOutbound(orgId: string, addonId: string, messageId: string): void;

  abstract isOutbound(orgId: string, addonId: string, messageId: string): boolean;
}
