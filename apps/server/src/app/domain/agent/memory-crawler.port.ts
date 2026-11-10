export abstract class MemoryCrawlerPort {
  abstract runNow(orgId: string): Promise<void>;
}
