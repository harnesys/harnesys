import { Injectable } from '@harnesys/brix';
import { Cron } from 'croner';
import { ConnectSessionStorePort } from '../../domain/apps/ports/connect-session-store.port.ts';

@Injectable()
export class ConnectReaper {
  private readonly job: Cron;

  constructor(private readonly sessions: ConnectSessionStorePort) {
    this.job = new Cron('*/30 * * * * *', () => {
      this.sessions.sweep(Date.now());
    });
  }

  stop(): void {
    this.job.stop();
  }
}
