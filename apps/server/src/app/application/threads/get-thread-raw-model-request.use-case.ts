import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { isThreadRawModelRequestName } from './thread-raw-model-request-name.ts';

export interface ThreadRawModelRequest {
  name: string;
  meta?: unknown;
  plan?: unknown;
  request?: unknown;
}

@Injectable()
export class GetThreadRawModelRequestUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(orgId: string, threadId: string, name: string): Promise<ThreadRawModelRequest> {
    if (!this.threads.findById(orgId, threadId)) {
      throw new ThreadNotFoundException(threadId);
    }
    if (!isThreadRawModelRequestName(name)) {
      throw new ThreadNotFoundException(name);
    }
    const path = join(
      this.layout.threadDir(orgId, threadId),
      '.runtime',
      'raw-model-requests',
      name,
    );
    const raw = await readFile(path, 'utf8');
    const envelope = JSON.parse(raw) as ThreadRawModelRequest;
    return { name, meta: envelope.meta, plan: envelope.plan, request: envelope.request };
  }
}
