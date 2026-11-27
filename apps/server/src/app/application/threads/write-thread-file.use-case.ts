import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { MAX_EDITOR_BYTES } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { resolveThreadEntryPath } from './thread-files-paths.ts';

export interface WriteThreadFileInput {
  orgId: string;
  threadId: string;
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
}

export interface ThreadFileWritePayload {
  path: string;
  etag: string;
}

@Injectable()
export class WriteThreadFileUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly layout: HostFsLayoutPort,
    private readonly events: ThreadEventsPort,
  ) {}

  async execute(input: WriteThreadFileInput): Promise<ThreadFileWritePayload> {
    if (!this.threads.findById(input.orgId, input.threadId)) {
      throw new ThreadNotFoundException(input.threadId);
    }
    const [firstSegment] = input.path
      .replaceAll('\\', '/')
      .split('/')
      .filter((segment) => segment.length > 0);
    if (firstSegment === 'attachments' || firstSegment === 'tool-outputs') {
      throw new ThreadValidationException(`path is not writable: ${input.path}`);
    }
    const threadDir = this.layout.threadDir(input.orgId, input.threadId);
    const abs = resolveThreadEntryPath(threadDir, input.path);
    if (!abs) {
      throw new ThreadValidationException(`path outside thread directory: ${input.path}`);
    }
    const bytes =
      input.encoding === 'base64'
        ? Uint8Array.from(Buffer.from(input.content, 'base64'))
        : new TextEncoder().encode(input.content);
    if (bytes.byteLength > MAX_EDITOR_BYTES) {
      throw new ThreadValidationException('file exceeds the editor size limit');
    }
    await mkdir(dirname(abs), { recursive: true, mode: 0o700 });
    await writeFile(abs, bytes);
    const info = await stat(abs);
    this.events.emit(input.orgId, {
      type: 'files-changed',
      threadId: input.threadId,
      roots: ['thread'],
    });
    return { path: input.path, etag: makeEtag(info.mtimeMs, info.size) };
  }
}

function makeEtag(mtimeMs: number, size: number): string {
  return `"${Math.floor(mtimeMs).toString(16)}-${size.toString(16)}"`;
}
