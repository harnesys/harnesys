import { HttpException, Injectable, UnauthorizedException } from '@harnesys/brix';
import type { FetchRunAttachmentBody } from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MAX_ATTACHMENT_BYTES } from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface FetchRunAttachmentInput {
  orgId: string;
  bearerToken: string;
  body: FetchRunAttachmentBody;
}

export interface FetchRunAttachmentResult {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
}

@Injectable()
export class FetchRunAttachmentUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly claims: EventClaimPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(input: FetchRunAttachmentInput): Promise<FetchRunAttachmentResult> {
    const token = input.bearerToken.trim();
    if (!token) {
      throw new UnauthorizedException('node token required');
    }
    const row = this.nodes.findByTokenHash(input.orgId, hashNodeToken(token));
    if (!row) {
      throw new UnauthorizedException('node unauthorized');
    }
    const claim = this.claims.findByRun(input.orgId, input.body.runId);
    const now = new Date().toISOString();
    if (!claim || claim.nodeId !== row.id || claim.doneAt !== null || claim.leaseUntil <= now) {
      throw new HttpException(
        403,
        'ATTACHMENT_FETCH_FORBIDDEN',
        'Attachment fetch requires active lease ownership',
        { runId: input.body.runId, attachmentId: input.body.attachmentId },
      );
    }
    const meta = this.attachments.findById(input.orgId, input.body.attachmentId);
    if (!meta || meta.threadId !== input.body.threadId || !meta.path) {
      throw new ThreadValidationException(`attachment not found: ${input.body.attachmentId}`);
    }
    const bytes = await this.storage.read(
      this.layout.threadDir(input.orgId, input.body.threadId),
      meta.path,
    );
    if (!bytes) {
      throw new ThreadValidationException(`attachment file missing: ${input.body.attachmentId}`);
    }
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new HttpException(413, 'ATTACHMENT_TOO_LARGE', 'attachment exceeds upload limit');
    }
    return {
      fileName: meta.name,
      mediaType: meta.mediaType,
      bytes,
    };
  }
}
