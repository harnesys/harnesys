import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface ListTerminalSessionsInput {
  projectId?: string;
  orgId?: string;
}

@Injectable()
export class ListTerminalSessionsUseCase {
  constructor(private readonly sessions: TerminalSessionsPort) {}

  execute(input: ListTerminalSessionsInput): TerminalSessionRecord[] {
    if (input.projectId) {
      return this.sessions.list(input.projectId);
    }
    return this.sessions.listAll(input.orgId);
  }
}
