import type { ManagerThreadTailItem } from 'harnesys';

export abstract class ManagerTailPort {
  abstract tail(orgId: string, threadId: string, limit: number): ManagerThreadTailItem[];
}
