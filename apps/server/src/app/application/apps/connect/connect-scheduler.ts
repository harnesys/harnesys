import { Injectable } from '@harnesys/brix';
import { PollConnectUseCase } from './poll-connect.use-case.ts';

@Injectable()
export class ConnectScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly poll: PollConnectUseCase) {}

  schedule(orgId: string, sessionId: string, intervalSec: number): void {
    this.cancel(sessionId);
    const delayMs = Math.max(intervalSec, 1) * 1000;
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.poll.execute({ orgId, sessionId }).then(
        (status) => {
          if (status === 'pending') {
            this.schedule(orgId, sessionId, intervalSec);
          }
        },
        () => undefined,
      );
    }, delayMs);
    timer.unref?.();
    this.timers.set(sessionId, timer);
  }

  cancel(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }
}
