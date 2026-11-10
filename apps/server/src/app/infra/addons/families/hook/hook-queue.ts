export interface HookQueuedDelivery {
  hookId: string;
  event: Record<string, unknown>;
}

export class HookQueue {
  private readonly items: HookQueuedDelivery[] = [];
  droppedTotal = 0;

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: HookQueuedDelivery): number {
    this.items.push(item);
    let dropped = 0;
    while (this.items.length > this.limit) {
      this.items.shift();
      dropped += 1;
      this.droppedTotal += 1;
    }
    return dropped;
  }

  take(): HookQueuedDelivery | undefined {
    return this.items.shift();
  }

  clear(): void {
    this.items.length = 0;
  }
}
