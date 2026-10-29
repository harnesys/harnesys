import type { PendingSessionEvent, SessionEvent } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';

export interface RunAppendContext {
  park: boolean;
}

export type RunEventAppendWithinTx = (
  tx: OrgSqliteDb,
  runId: string,
  threadId: string,
  events: PendingSessionEvent[],
  context?: RunAppendContext,
) => SessionEvent[];
