import { Injectable } from '@harnesys/brix';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';

@Injectable()
export class WaitTickerGateAdapter extends WaitTickerGatePort {
  private readonly waiting = new Set<string>();

  hold(orgId: string): void {
    this.waiting.add(orgId);
  }

  release(orgId: string): void {
    this.waiting.delete(orgId);
  }

  active(): string[] {
    return [...this.waiting];
  }
}
