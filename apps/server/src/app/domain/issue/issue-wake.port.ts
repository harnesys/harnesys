export abstract class IssueWakePort {
  abstract wake(orgId: string, wakeKey: string, agentId?: string): Promise<number>;
}
