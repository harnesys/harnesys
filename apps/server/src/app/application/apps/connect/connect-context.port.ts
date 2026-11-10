import type {
  ConnectPollCtx,
  ConnectResumeCtx,
  ConnectStartCtx,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord, ConnectSession } from '../../../domain/apps/records.ts';
import type { ConnectContextInput } from './connect-context.ts';

export abstract class ConnectContextPort {
  abstract start(input: ConnectContextInput, state: string): ConnectStartCtx;
  abstract resume(input: ConnectContextInput): ConnectResumeCtx;
  abstract poll(input: ConnectContextInput): ConnectPollCtx;
  abstract appFor(session: ConnectSession): AppRecord | null;
  abstract existingFor(session: ConnectSession): AccountRecord | null;
}
