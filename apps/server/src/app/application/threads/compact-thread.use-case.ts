import { Injectable } from '@harnesys/brix';
import {
  type CompactThreadResult,
  LocalExecutorPort,
} from '../../domain/thread/local-executor.port.ts';

export interface CompactThreadRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class CompactThreadUseCase {
  constructor(private readonly executor: LocalExecutorPort) {}

  execute(request: CompactThreadRequest): Promise<CompactThreadResult> {
    return this.executor.compact(request.orgId, request.threadId);
  }
}
