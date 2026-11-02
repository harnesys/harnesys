import { Injectable } from '@harnesys/brix';
import { TerminalSessionNotFoundException } from '../../domain/terminal/terminal.error.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface StopTerminalSessionInput {
  projectId?: string;
  sessionId: string;
}

@Injectable()
export class StopTerminalSessionUseCase {
  constructor(private readonly sessions: TerminalSessionsPort) {}

  execute(input: StopTerminalSessionInput): void {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    if (input.projectId !== undefined && session.projectId !== input.projectId) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    this.sessions.stop(input.sessionId);
  }
}
