import { readFile, stat } from 'node:fs/promises';
import { Injectable } from '@harnesys/brix';
import { AddonError, type InboundAttachment } from '@harnesys/sdk';
import { resolveWorkspaceFilePath } from 'harnesys/file-access';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { MAX_ATTACHMENT_BYTES } from '../../../domain/thread/attachment.ts';

export interface ResolvedInboundAttachment {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

@Injectable()
export class InboundAttachmentResolver {
  constructor(private readonly layout: HostFsLayoutPort) {}

  async resolve(
    orgId: string,
    attachments: readonly InboundAttachment[],
  ): Promise<ResolvedInboundAttachment[]> {
    const resolved: ResolvedInboundAttachment[] = [];
    for (const attachment of attachments) {
      resolved.push(await this.resolveOne(orgId, attachment));
    }
    return resolved;
  }

  private async resolveOne(
    orgId: string,
    attachment: InboundAttachment,
  ): Promise<ResolvedInboundAttachment> {
    const bytes =
      attachment.path === undefined
        ? decodeInline(attachment.dataBase64 ?? '')
        : await readWorkspaceFile(this.layout, orgId, attachment.path);
    if (bytes.byteLength === 0) {
      throw new AddonError('invalid_params', { detail: 'attachment is empty' });
    }
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new AddonError('invalid_params', {
        detail: `attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
      });
    }
    return {
      name: attachment.name,
      mediaType: attachment.mediaType ?? DEFAULT_MEDIA_TYPE,
      bytes,
    };
  }
}

function decodeInline(data: string): Uint8Array {
  if (data === '') {
    return new Uint8Array();
  }
  return new Uint8Array(Buffer.from(data, 'base64'));
}

async function readWorkspaceFile(
  layout: HostFsLayoutPort,
  orgId: string,
  path: string,
): Promise<Uint8Array> {
  const root = layout.ensureOrgWorkspace(orgId);
  let absolute: string;
  try {
    absolute = resolveWorkspaceFilePath(root, path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AddonError('invalid_params', { detail });
  }
  const info = await stat(absolute).catch(() => null);
  if (info === null || !info.isFile()) {
    throw new AddonError('not_found', { detail: `no such file: ${path}` });
  }
  if (info.size > MAX_ATTACHMENT_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
    });
  }
  return new Uint8Array(await readFile(absolute));
}
