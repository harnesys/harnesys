import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface UndoThreadCompactRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class UndoThreadCompactUseCase {
  constructor(private readonly executor: LocalExecutorPort) {}

  execute(request: UndoThreadCompactRequest): Promise<SessionEvent> {
    return this.executor.undoThreadCompact(request.orgId, request.threadId);
  }
}
