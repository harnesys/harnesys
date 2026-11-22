export abstract class SignalWakePort {
  abstract wake(orgId: string, wakeKey: string, agentId?: string): Promise<number>;
}
