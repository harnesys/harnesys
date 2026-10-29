import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface ListTerminalSessionsInput {
  projectId: string;
}

@Injectable()
export class ListTerminalSessionsUseCase {
  constructor(private readonly sessions: TerminalSessionsPort) {}

  execute(input: ListTerminalSessionsInput): TerminalSessionRecord[] {
    return this.sessions.list(input.projectId);
  }
}
