import type { WorkerCommand } from './worker-command.ts';

export abstract class NodeCommandQueuePort {
  abstract enqueue(orgId: string, nodeId: string, command: WorkerCommand): void;
  abstract list(orgId: string, nodeId: string): Array<{ id: string; command: WorkerCommand }>;
  abstract remove(orgId: string, id: string): void;
  abstract drain(
    orgId: string,
    nodeId: string,
    deliver: (command: WorkerCommand) => Promise<boolean>,
  ): Promise<void>;
}
