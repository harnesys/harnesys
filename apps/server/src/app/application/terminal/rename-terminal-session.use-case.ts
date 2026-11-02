import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { TerminalSessionNotFoundException } from '../../domain/terminal/terminal.error.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface RenameTerminalSessionInput {
  projectId?: string;
  sessionId: string;
  title: string;
}

@Injectable()
export class RenameTerminalSessionUseCase {
  constructor(private readonly sessions: TerminalSessionsPort) {}

  execute(input: RenameTerminalSessionInput): TerminalSessionRecord {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    if (input.projectId !== undefined && session.projectId !== input.projectId) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    const updated = this.sessions.rename(input.sessionId, input.title);
    if (updated === null) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    return updated;
  }
}
