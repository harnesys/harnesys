export abstract class WaitTickerGatePort {
  abstract hold(orgId: string): void;
  abstract release(orgId: string): void;
  abstract active(): string[];
}
