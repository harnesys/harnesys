import { isAbsolute } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { ThreadSummary, UpdateThreadBindingBody } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toThreadSummary } from './thread.helpers.ts';

export interface UpdateThreadBindingRequest {
  orgId: string;
  threadId: string;
  body: UpdateThreadBindingBody;
}

@Injectable()
export class UpdateThreadBindingUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly profiles: ExecutionProfilePort,
  ) {}

  execute(request: UpdateThreadBindingRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (request.body.runProfileId) {
      this.assertProfile(request.orgId, request.body.runProfileId);
    }
    if (request.body.runDirectory) {
      assertAbsoluteDirectory(request.body.runDirectory);
    }
    const ranThreadIds = this.threads.threadIdsWithRuns(request.orgId);
    const locked = ranThreadIds.has(thread.id);
    const changes =
      (request.body.runProfileId !== undefined &&
        request.body.runProfileId !== thread.runProfileId) ||
      (request.body.runDirectory !== undefined &&
        request.body.runDirectory !== thread.runDirectory);
    if (locked && changes) {
      throw new ThreadValidationException('thread binding is locked after the first run');
    }
    const updated = this.threads.patch(request.orgId, thread.id, {
      ...(request.body.runProfileId !== undefined
        ? { runProfileId: request.body.runProfileId }
        : {}),
      ...(request.body.runDirectory !== undefined
        ? { runDirectory: request.body.runDirectory }
        : {}),
    });
    return toThreadSummary({
      thread: updated,
      agentName: '',
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: locked,
    });
  }

  private assertProfile(orgId: string, profileId: string): void {
    if (!this.profiles.findById(orgId, profileId)) {
      throw new ThreadValidationException(`execution profile not found: ${profileId}`);
    }
  }
}

function assertAbsoluteDirectory(directory: string): void {
  if (!isAbsolute(directory)) {
    throw new ThreadValidationException(`runDirectory must be an absolute path: ${directory}`);
  }
}
