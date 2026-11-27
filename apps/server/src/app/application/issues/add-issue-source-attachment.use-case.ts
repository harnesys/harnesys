import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { AddIssueSourceAttachmentBody, IssueAttachmentPublic } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import {
  issueDir,
  MAX_ISSUE_ATTACHMENT_BYTES,
  mediaTypeFromFileName,
} from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { kindFromMediaType, sanitizeFileName } from '../../domain/thread/attachment.ts';
import { resolveThreadEntryPath } from '../threads/thread-files-paths.ts';
import { loadActiveIssue } from './issue-guards.ts';
import { toAttachmentPublic } from './issue-mappers.ts';

export interface AddIssueSourceAttachmentRequest {
  orgId: string;
  issueId: string;
  body: AddIssueSourceAttachmentBody;
  threadId?: string;
}

type RootLookup = { kind: 'file'; sizeBytes: number } | { kind: 'missing' } | { kind: 'not-file' };

type ResolvedFile =
  | { root: 'source'; relativePath: string; sizeBytes: number }
  | { root: 'run'; absolutePath: string; sizeBytes: number };

@Injectable()
export class AddIssueSourceAttachmentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: AddIssueSourceAttachmentRequest): Promise<IssueAttachmentPublic> {
    const issue = loadActiveIssue(this.issues, this.boards, request.orgId, request.issueId);
    const source = resolveSource(this.sources, request.orgId, request.body.sourceId);
    const location = this.sourceLocation.resolve({
      orgId: request.orgId,
      sourceId: source.id,
      hostId: this.machineConfig.get().id,
    });
    const file = this.statFile(request, location.absoluteRoot);
    if (file.sizeBytes > MAX_ISSUE_ATTACHMENT_BYTES) {
      throw new IssueValidationException('attachment exceeds the size limit');
    }
    if (file.root === 'source') {
      return this.insertPointer(request, issue.id, source.id, file);
    }
    return this.insertSnapshot(request, issue.id, file);
  }

  private insertPointer(
    request: AddIssueSourceAttachmentRequest,
    issueId: string,
    sourceId: string,
    file: { relativePath: string; sizeBytes: number },
  ): IssueAttachmentPublic {
    const mediaType = mediaTypeFromFileName(file.relativePath);
    const record = this.attachments.insert({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      issueId,
      kind: 'source',
      name: sanitizeFileName(request.body.name ?? file.relativePath.split('/').pop() ?? 'file'),
      mediaType,
      kindMedia: kindFromMediaType(mediaType),
      sizeBytes: file.sizeBytes,
      path: null,
      sourceId,
      sourcePath: file.relativePath,
      createdAt: new Date().toISOString(),
    });
    return toAttachmentPublic(record);
  }

  private async insertSnapshot(
    request: AddIssueSourceAttachmentRequest,
    issueId: string,
    file: { absolutePath: string; sizeBytes: number },
  ): Promise<IssueAttachmentPublic> {
    const id = crypto.randomUUID();
    const fileName = sanitizeFileName(request.body.name ?? basename(file.absolutePath));
    const mediaType = mediaTypeFromFileName(file.absolutePath);
    const bytes = readFileSync(file.absolutePath);
    const path = await this.storage.write(
      issueDir(this.layout, request.orgId, issueId),
      id,
      fileName,
      bytes,
    );
    const record = this.attachments.insert({
      id,
      orgId: request.orgId,
      issueId,
      kind: 'file',
      name: fileName,
      mediaType,
      kindMedia: kindFromMediaType(mediaType),
      sizeBytes: bytes.byteLength,
      path,
      sourceId: null,
      sourcePath: null,
      createdAt: new Date().toISOString(),
    });
    return toAttachmentPublic(record);
  }

  private statFile(request: AddIssueSourceAttachmentRequest, sourceRoot: string): ResolvedFile {
    const sourcePath = request.body.sourcePath;
    const relativePath = normalizeSourcePath(sourceRoot, sourcePath);
    const sourceAbs = resolve(join(sourceRoot, relativePath));
    if (!sourceAbs.startsWith(sourceRoot + sep)) {
      throw new IssueValidationException(`source path escapes the source root: ${sourcePath}`);
    }
    const atSource = lookupFile(sourceAbs);
    if (atSource.kind === 'file') {
      return { root: 'source', relativePath, sizeBytes: atSource.sizeBytes };
    }
    if (atSource.kind === 'not-file') {
      throw new IssueValidationException(`source path is not a file: ${sourcePath}`);
    }
    if (request.threadId === undefined) {
      throw new IssueValidationException(
        `source file not found: ${sourcePath} (use a path inside the source root ${sourceRoot})`,
      );
    }
    const threadDir = this.layout.threadDir(request.orgId, request.threadId);
    const threadAbs = resolveThreadEntryPath(threadDir, sourcePath);
    if (threadAbs !== null) {
      const atThread = lookupFile(threadAbs);
      if (atThread.kind === 'file') {
        return { root: 'run', absolutePath: threadAbs, sizeBytes: atThread.sizeBytes };
      }
      if (atThread.kind === 'not-file') {
        throw new IssueValidationException(`source path is not a file: ${sourcePath}`);
      }
    }
    throw new IssueValidationException(
      `source file not found: ${sourcePath} (not inside the source root ${sourceRoot} and not inside the run root ${threadDir}, the thread directory where this run writes its files; use a path relative to either root)`,
    );
  }
}

function lookupFile(absPath: string): RootLookup {
  let stat: { size: number; isFile(): boolean };
  try {
    stat = statSync(absPath);
  } catch {
    return { kind: 'missing' };
  }
  if (!stat.isFile()) {
    return { kind: 'not-file' };
  }
  return { kind: 'file', sizeBytes: stat.size };
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
