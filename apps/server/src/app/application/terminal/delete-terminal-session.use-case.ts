import { Injectable } from '@harnesys/brix';
import { TerminalSessionNotFoundException } from '../../domain/terminal/terminal.error.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface DeleteTerminalSessionInput {
  projectId: string;
  sessionId: string;
}

@Injectable()
export class DeleteTerminalSessionUseCase {
  constructor(private readonly sessions: TerminalSessionsPort) {}

  execute(input: DeleteTerminalSessionInput): void {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.projectId !== input.projectId) {
      throw new TerminalSessionNotFoundException(input.sessionId);
    }
    this.sessions.delete(input.sessionId);
  }
}
