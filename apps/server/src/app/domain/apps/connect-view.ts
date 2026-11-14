import type { AccountErrorCode } from './errors.ts';
import type { FieldSpec } from './field.ts';
import type { ConnectTarget } from './records.ts';

export type LaunchView =
  | { kind: 'redirect'; url: string }
  | { kind: 'page'; url: string }
  | { kind: 'device'; userCode: string; verificationUri: string; intervalSec: number }
  | { kind: 'form'; fields: FieldSpec[]; text?: string };

export type ConnectStartResponse =
  | { status: 'completed'; target: ConnectTarget; id: string }
  | { status: 'pending'; sessionId: string; launch: LaunchView; expiresAt: number };

export type SessionEvent =
  | { status: 'pending' }
  | { status: 'completed'; target: ConnectTarget; id: string }
  | { status: 'failed'; error: AccountErrorCode; retryAfterSec?: number };

export interface ConnectResumeResponse {
  session: SessionEvent;
  launch?: LaunchView;
}
