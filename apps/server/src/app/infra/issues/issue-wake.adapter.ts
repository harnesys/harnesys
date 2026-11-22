import { Injectable } from '@harnesys/brix';
import { IssueWakePort } from '../../domain/issue/issue-wake.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

@Injectable()
export class IssueWakeAdapter extends IssueWakePort {
  constructor(private readonly executor: LocalExecutorPort) {
    super();
  }

  wake(orgId: string, wakeKey: string, agentId?: string): Promise<number> {
    return this.executor.wakeRuns(orgId, wakeKey, agentId);
  }
}
