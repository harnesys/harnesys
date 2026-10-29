import { Injectable } from '@harnesys/brix';
import type { ContentReadMeta } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface ReadFileInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class ReadFileUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: ReadFileInput): Promise<ContentReadMeta> {
    const result = await this.content.read(
      input.orgId,
      input.sourceId,
      input.path,
      input.worktreeId,
    );
    const text = tryUtf8(result.bytes);
    if (text !== null) {
      return {
        path: input.path,
        etag: result.etag,
        size: result.size,
        encoding: 'utf-8',
        content: text,
      };
    }
    return {
      path: input.path,
      etag: result.etag,
      size: result.size,
      encoding: 'base64',
      content: Buffer.from(result.bytes).toString('base64'),
    };
  }
}

function tryUtf8(bytes: Uint8Array): string | null {
  if (bytes.length === 0) {
    return '';
  }
  for (const byte of bytes) {
    if (byte === 0) {
      return null;
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
