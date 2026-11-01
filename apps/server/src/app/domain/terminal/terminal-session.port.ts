import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import type { ProcessJobRegistry } from 'harnesys';

export type TerminalDataListener = (chunk: string) => void;

export type TerminalExitListener = (code: number | null) => void;

export interface CreateTerminalSessionInput {
  projectId: string;
  cwd: string;
  orgId?: string;
}

export interface TerminalJobSnapshot {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  status: string;
  exitCode: number | null;
  origin?: 'user' | 'agent';
  name?: string;
  orgId?: string;
  target?: unknown;
}

export abstract class TerminalSessionsPort {
  abstract list(projectId: string): TerminalSessionRecord[];
  abstract listAll(orgId?: string): TerminalSessionRecord[];
  abstract get(sessionId: string): TerminalSessionRecord | null;
  abstract create(input: CreateTerminalSessionInput): TerminalSessionRecord;
  abstract upsertExternal(job: TerminalJobSnapshot): void;
  abstract jobRegistry(): ProcessJobRegistry;
  abstract write(sessionId: string, data: string): boolean;
  abstract resize(sessionId: string, cols: number, rows: number): boolean;
  abstract subscribe(
    sessionId: string,
    onData: TerminalDataListener,
    onExit?: TerminalExitListener,
  ): (() => void) | null;
  abstract scrollback(sessionId: string): string | null;
  abstract delete(sessionId: string): boolean;
}
