import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface DeleteThreadRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class DeleteThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: DeleteThreadRequest): Promise<void> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    await this.cancelActiveRun(request.orgId, request.threadId);
    this.threads.delete(request.orgId, request.threadId);
    await this.storage.removeThread(this.layout.threadDir(request.orgId, request.threadId));
  }

  async deleteByIssue(orgId: string, issueId: string): Promise<void> {
    for (const thread of this.threads.listByIssue(orgId, issueId)) {
      try {
        await this.execute({ orgId, threadId: thread.id });
      } catch (error) {
        if (!(error instanceof ThreadNotFoundException)) {
          throw error;
        }
      }
    }
  }

  private async cancelActiveRun(orgId: string, threadId: string): Promise<void> {
    try {
      const lifecycle = await this.executor.lifecycle(orgId);
      const active = await lifecycle.activeByThread(threadId);
      if (active) {
        await this.executor.cancel(orgId, active.runId);
      }
    } catch {
      // best-effort: deletion must proceed even if the run is already gone
    }
  }
}
