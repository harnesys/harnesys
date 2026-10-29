import { statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { AddIssueSourceAttachmentBody, IssueAttachmentPublic } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import {
  MAX_ISSUE_ATTACHMENT_BYTES,
  mediaTypeFromFileName,
} from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { kindFromMediaType, sanitizeFileName } from '../../domain/thread/attachment.ts';
import { loadActiveIssue } from './issue-guards.ts';
import { toAttachmentPublic } from './issue-mappers.ts';

export interface AddIssueSourceAttachmentRequest {
  orgId: string;
  issueId: string;
  body: AddIssueSourceAttachmentBody;
}

@Injectable()
export class AddIssueSourceAttachmentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(request: AddIssueSourceAttachmentRequest): IssueAttachmentPublic {
    const issue = loadActiveIssue(this.issues, this.boards, request.orgId, request.issueId);
    const source = resolveSource(this.sources, request.orgId, request.body.sourceId);
    const stat = statSourceFile(
      this.sourceLocation,
      this.machineConfig.get().id,
      request.orgId,
      source.id,
      request.body.sourcePath,
    );
    if (stat.sizeBytes > MAX_ISSUE_ATTACHMENT_BYTES) {
      throw new IssueValidationException('attachment exceeds the size limit');
    }
    const mediaType = mediaTypeFromFileName(stat.sourcePath);
    const record = this.attachments.insert({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      issueId: issue.id,
      kind: 'source',
      name: sanitizeFileName(request.body.name ?? stat.sourcePath.split('/').pop() ?? 'file'),
      mediaType,
      kindMedia: kindFromMediaType(mediaType),
      sizeBytes: stat.sizeBytes,
      path: null,
      sourceId: source.id,
      sourcePath: stat.sourcePath,
      createdAt: new Date().toISOString(),
    });
    return toAttachmentPublic(record);
  }
}

function statSourceFile(
  sourceLocation: SourceLocationPort,
  hostId: string,
  orgId: string,
  sourceId: string,
  sourcePath: string,
): { sizeBytes: number; sourcePath: string } {
  const location = sourceLocation.resolve({ orgId, sourceId, hostId });
  const relativePath = normalizeSourcePath(location.absoluteRoot, sourcePath);
  const absPath = resolve(join(location.absoluteRoot, relativePath));
  if (!absPath.startsWith(location.absoluteRoot + sep)) {
    throw new IssueValidationException(`source path escapes the source root: ${sourcePath}`);
  }
  let stat: { size: number; isFile(): boolean };
  try {
    stat = statSync(absPath);
  } catch {
    throw new IssueValidationException(
      `source file not found: ${sourcePath} (use a path inside the source root ${location.absoluteRoot})`,
    );
  }
  if (!stat.isFile()) {
    throw new IssueValidationException(`source path is not a file: ${sourcePath}`);
  }
  return { sizeBytes: stat.size, sourcePath: relativePath };
}

function normalizeSourcePath(root: string, sourcePath: string): string {
  if (!isAbsolute(sourcePath)) {
    return sourcePath;
  }
  const relPath = relative(root, resolve(sourcePath));
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    throw new IssueValidationException(`source path escapes the source root: ${sourcePath}`);
  }
  return relPath;
}

function resolveSource(sources: SourceRegistryPort, orgId: string, sourceId: string): SourceRecord {
  const byId = sources.findById(orgId, sourceId);
  if (byId) {
    return byId;
  }
  const lowered = sourceId.toLowerCase();
  const byName = sources.list(orgId).find((item) => item.name.toLowerCase() === lowered);
  if (byName) {
    return byName;
  }
  const managed = sources.findManagedWorkspace(orgId);
  if (lowered === 'workspace' && managed) {
    return managed;
  }
  throw new IssueValidationException(`source not found: ${sourceId}`);
}
