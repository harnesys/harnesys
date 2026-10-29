import type { TerminalSessionRecord } from '@harnesys/studio-shared';

export type TerminalDataListener = (chunk: string) => void;

export type TerminalExitListener = (code: number | null) => void;

export interface CreateTerminalSessionInput {
  projectId: string;
  cwd: string;
}

export abstract class TerminalSessionsPort {
  abstract list(projectId: string): TerminalSessionRecord[];
  abstract get(sessionId: string): TerminalSessionRecord | null;
  abstract create(input: CreateTerminalSessionInput): TerminalSessionRecord;
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
