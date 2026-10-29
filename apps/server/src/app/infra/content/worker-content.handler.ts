import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainException, HttpException, Injectable } from '@harnesys/brix';
import type { SourceVcs } from '@harnesys/contracts';
import type { ProxyHttpResult } from '../../domain/fleet/fleet-hub.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { decideSourceVcsUpdate } from '../../domain/source/decide-source-vcs.ts';
import type { VcsProbeRaw } from '../../domain/source/git-vcs.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import {
  downloadAt,
  duplicateAt,
  listTreeAt,
  mkdirAt,
  moveAt,
  readAt,
  removeAt,
  revealAt,
  statAt,
  writeAt,
} from './fs-content-ops.ts';
import { copyAt } from './fs-copy-ops.ts';
import { listHostDirectories } from './list-host-directories.ts';
import {
  type WorkerHostBrowseRequest,
  type WorkerRequest,
  WorkerRequestSchema,
} from './worker-content.protocol.ts';
import { resolveWorktreeContentRoot } from './worktree-content-root.ts';

const DOMAIN_STATUS: Record<string, number> = {
  ENTITY_NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  BUSINESS_RULE_VIOLATION: 422,
  SOURCE_HOST_MISMATCH: 422,
  SOURCE_MATERIALIZATION_ABSENT: 404,
  SOURCE_MATERIALIZATION_FAILED: 500,
};

@Injectable()
export class WorkerContentHandler {
  constructor(
    private readonly sourceLocation: SourceLocationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly git: GitVcsPort,
  ) {}

  async handle(orgId: string, rawBody: string | null | undefined): Promise<ProxyHttpResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody ?? '');
    } catch {
      return errorResult(400, 'VALIDATION_ERROR', 'invalid worker content body');
    }
    const body = WorkerRequestSchema.safeParse(parsed);
    if (!body.success) {
      return errorResult(400, 'VALIDATION_ERROR', 'invalid worker content request');
    }
    try {
      const payload = await executeOp(orgId, body.data, {
        sourceLocation: this.sourceLocation,
        machineConfig: this.machineConfig,
        layout: this.layout,
        git: this.git,
      });
      return {
        status: 200,
        body: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
        contentType: 'application/json',
        headers: null,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        return errorResult(err.status, err.errorCode, err.message, err.details);
      }
      if (err instanceof DomainException) {
        return errorResult(
          DOMAIN_STATUS[err.errorCode] ?? 500,
          err.errorCode,
          err.message,
          err.details,
        );
      }
      return errorResult(
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'worker content failed',
      );
    }
  }
}

interface ContentOpDeps {
  sourceLocation: SourceLocationPort;
  machineConfig: MachineConfigPort;
  layout: HostFsLayoutPort;
  git: GitVcsPort;
}

async function executeOp(orgId: string, req: WorkerRequest, deps: ContentOpDeps): Promise<unknown> {
  if (isHostBrowseRequest(req)) {
    return executeHostOp(req, deps.git);
  }
  const root =
    req.worktreeId !== undefined
      ? resolveWorktreeContentRoot(
          deps.layout.sourceWorktreesDir(orgId, req.sourceId),
          req.worktreeId,
        )
      : deps.sourceLocation.resolve({
          orgId,
          sourceId: req.sourceId,
          hostId: deps.machineConfig.get().id,
        }).absoluteRoot;
  switch (req.op) {
    case 'tree':
      return listTreeAt(root, req.relPath);
    case 'read': {
      const result = readAt(root, req.relPath);
      return {
        bytesBase64: Buffer.from(result.bytes).toString('base64'),
        etag: result.etag,
        size: result.size,
        mtime: result.mtime,
      };
    }
    case 'write': {
      const bytes = Uint8Array.from(Buffer.from(req.bytesBase64 ?? '', 'base64'));
      return writeAt(root, req.relPath, bytes, req.ifMatch);
    }
    case 'mkdir':
      mkdirAt(root, req.relPath);
      return { ok: true };
    case 'remove':
      removeAt(root, req.relPath);
      return { ok: true };
    case 'move':
      moveAt(root, req.relPath, req.relPathTo ?? '');
      return { ok: true };
    case 'copy':
      copyAt(root, req.relPath, req.relPathTo ?? '');
      return { ok: true };
    case 'stat':
      return statAt(root, req.relPath);
    case 'duplicate':
      return duplicateAt(root, req.relPath);
    case 'reveal':
      revealAt(root, req.relPath);
      return { ok: true };
    case 'download': {
      const result = downloadAt(root, req.relPath);
      return {
        name: result.name,
        bytesBase64: Buffer.from(result.bytes).toString('base64'),
      };
    }
    default:
      throw new HttpException(400, 'VALIDATION_ERROR', `unknown op`);
  }
}

function isHostBrowseRequest(req: WorkerRequest): req is WorkerHostBrowseRequest {
  return req.op === 'list-dirs' || req.op === 'assert-dir' || req.op === 'mkdir-dir';
}

function mkdirHostDir(rawPath: string): unknown {
  if (rawPath.trim().length === 0) {
    throw new HttpException(400, 'SOURCE_PATH_INVALID', 'absolutePath is required');
  }
  const resolved = resolve(rawPath);
  try {
    mkdirSync(resolved, { recursive: true });
  } catch {
    throw new HttpException(400, 'SOURCE_PATH_INVALID', `cannot create directory: ${resolved}`);
  }
  return { ok: true, absolutePath: resolved };
}

async function executeHostOp(req: WorkerHostBrowseRequest, git: GitVcsPort): Promise<unknown> {
  if (req.op === 'list-dirs') {
    return listHostDirectories(req.absolutePath);
  }
  if (req.op === 'mkdir-dir') {
    return mkdirHostDir(req.absolutePath);
  }
  if (req.absolutePath.trim().length === 0) {
    throw new HttpException(400, 'SOURCE_PATH_INVALID', 'absolutePath is required');
  }
  const resolved = resolve(req.absolutePath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new HttpException(400, 'SOURCE_PATH_INVALID', `path is not a directory: ${resolved}`);
  }
  let probe: VcsProbeRaw | null;
  try {
    probe = await git.probe(resolved);
  } catch {
    probe = null;
  }
  const vcs: SourceVcs | null = probe ? (decideSourceVcsUpdate(null, probe) ?? null) : null;
  return { ok: true, absolutePath: resolved, vcs };
}

function errorResult(
  status: number,
  errorCode: string,
  message: string,
  details?: unknown,
): ProxyHttpResult {
  return {
    status,
    body: Buffer.from(
      JSON.stringify({ statusCode: status, errorCode, message, details }),
      'utf8',
    ).toString('base64'),
    contentType: 'application/json',
    headers: null,
  };
}
