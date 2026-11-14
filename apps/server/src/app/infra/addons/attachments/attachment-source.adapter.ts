import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { resolveWorkspaceFilePath } from 'harnesys/file-access';
import type {
  AttachmentSourceInput,
  AttachmentSourceResult,
} from '../../../domain/addons/ports/attachment-source.port.ts';
import { AddonAttachmentSourcePort } from '../../../domain/addons/ports/attachment-source.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { MAX_ATTACHMENT_BYTES } from '../../../domain/thread/attachment.ts';

@Injectable()
export class WorkspaceAttachmentSourceAdapter extends AddonAttachmentSourcePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override async read(input: AttachmentSourceInput): Promise<AttachmentSourceResult> {
    const root = this.layout.ensureOrgWorkspace(input.orgId);
    let absolute: string;
    try {
      absolute = resolveWorkspaceFilePath(root, input.path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AddonError('invalid_params', { detail });
    }
    const info = await stat(absolute).catch(() => null);
    if (info === null || !info.isFile()) {
      throw new AddonError('not_found', { detail: `no such file: ${input.path}` });
    }
    if (info.size > MAX_ATTACHMENT_BYTES) {
      throw new AddonError('invalid_params', {
        detail: `attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
      });
    }
    return {
      name: basename(absolute),
      mediaType: Bun.file(absolute).type || 'application/octet-stream',
      bytes: new Uint8Array(await readFile(absolute)),
    };
  }
}
