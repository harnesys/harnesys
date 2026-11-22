import { Injectable } from '@harnesys/brix';
import { SignalWakePort } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

@Injectable()
export class SignalWakeAdapter extends SignalWakePort {
  constructor(private readonly executor: LocalExecutorPort) {
    super();
  }

  wake(orgId: string, wakeKey: string, agentId?: string): Promise<number> {
    return this.executor.wakeRuns(orgId, wakeKey, agentId);
  }
}
