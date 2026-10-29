import { lstat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { resolveThreadEntryPath, threadFileContentType } from './thread-files-paths.ts';

export interface ReadThreadFileInput {
  orgId: string;
  threadId: string;
  path: string;
}

export interface ThreadFilePayload {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
}

@Injectable()
export class ReadThreadFileUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(input: ReadThreadFileInput): Promise<ThreadFilePayload> {
    if (!this.threads.findById(input.orgId, input.threadId)) {
      throw new ThreadNotFoundException(input.threadId);
    }
    const threadDir = this.layout.threadDir(input.orgId, input.threadId);
    const abs = resolveThreadEntryPath(threadDir, input.path);
    if (!abs) {
      throw new ThreadValidationException(`path outside thread directory: ${input.path}`);
    }
    const info = await lstat(abs).catch(() => null);
    if (!info?.isFile()) {
      throw new ThreadValidationException(`file not found: ${input.path}`);
    }
    const bytes = await readFile(abs);
    const fileName = basename(abs);
    return { fileName, mediaType: threadFileContentType(fileName), bytes: new Uint8Array(bytes) };
  }
}
