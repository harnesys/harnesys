import { appendFile, mkdir, open, stat as statFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { DEFAULT_PATH_BLOCKLIST, isPathBlocked } from 'harnesys';
import { resolveWorkspaceFilePath } from 'harnesys/file-access';
import { threadFileRootOfPath } from '../../../../application/threads/thread-files-changed.ts';
import type {
  HostCallContext,
  HostMethodLimits,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { HostFsLayoutPort } from '../../../../domain/machine/host-fs-layout.port.ts';
import { ThreadEventsPort } from '../../../../domain/thread/thread-events.port.ts';
import { serviceMethod } from '../method.ts';

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const STAT_LIMITS: HostMethodLimits = { timeoutMs: 15_000 };
const READ_LIMITS: HostMethodLimits = {
  timeoutMs: 15_000,
  maxResultKb: 6_144,
  rate: { perSec: 50, burst: 100 },
};
const WRITE_LIMITS: HostMethodLimits = { timeoutMs: 30_000, rate: { perSec: 50, burst: 100 } };

interface ResolvedTarget {
  absolute: string;
  echo: string;
}

@Injectable()
export class FilesHostService implements HostServiceModule {
  readonly namespace = 'files';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly events: ThreadEventsPort,
  ) {
    this.methods = [
      serviceMethod('files.stat', STAT_LIMITS, (ctx, params) => this.stat(ctx, params)),
      serviceMethod('files.locate', STAT_LIMITS, (ctx, params) => this.locate(ctx, params)),
      serviceMethod('files.read', READ_LIMITS, (ctx, params) => this.read(ctx, params)),
      serviceMethod('files.write', WRITE_LIMITS, (ctx, params) => this.write(ctx, params)),
    ];
  }

  private async locate(
    ctx: HostCallContext,
    params: { scope: 'thread' | 'workspace' },
  ): Promise<{ path: string }> {
    if (params.scope === 'thread') {
      if (ctx.threadId === undefined) {
        throw new AddonError('invalid_params', {
          detail: 'thread scope requires a thread context (tool calls inside a thread run only)',
        });
      }
      return { path: this.layout.ensureThreadDir(ctx.orgId, ctx.threadId) };
    }
    return { path: this.layout.ensureOrgWorkspace(ctx.orgId) };
  }

  private async stat(
    ctx: HostCallContext,
    params: { path: string },
  ): Promise<{
    path: string;
    name: string;
    size: number;
    mediaType: string;
    modifiedAt: string;
  }> {
    const target = this.resolve(ctx, params.path);
    const info = await fileInfo(target.absolute, params.path);
    return {
      path: target.echo,
      name: basename(target.absolute),
      size: info.size,
      mediaType: mediaTypeOf(target.absolute),
      modifiedAt: info.mtime.toISOString(),
    };
  }

  private async read(
    ctx: HostCallContext,
    params: { path: string; offset?: number; length?: number },
  ): Promise<{ data: string; eof: boolean; size: number; mediaType: string }> {
    const target = this.resolve(ctx, params.path);
    const info = await fileInfo(target.absolute, params.path);
    const offset = Math.min(params.offset ?? 0, info.size);
    const requested = Math.min(params.length ?? MAX_CHUNK_BYTES, MAX_CHUNK_BYTES);
    const length = Math.max(0, Math.min(requested, info.size - offset));
    const handle = await open(target.absolute, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, offset);
      const data = result.bytesRead === length ? buffer : buffer.subarray(0, result.bytesRead);
      return {
        data: data.toString('base64'),
        eof: offset + result.bytesRead >= info.size,
        size: info.size,
        mediaType: mediaTypeOf(target.absolute),
      };
    } finally {
      await handle.close();
    }
  }

  private async write(
    ctx: HostCallContext,
    params: { path: string; data: string; append?: boolean },
  ): Promise<{ path: string; size: number }> {
    const target = this.resolve(ctx, params.path);
    const bytes = Buffer.from(params.data, 'base64');
    if (bytes.byteLength > MAX_CHUNK_BYTES) {
      throw new AddonError('invalid_params', {
        detail: `write chunk exceeds ${MAX_CHUNK_BYTES} bytes`,
      });
    }
    await mkdir(dirname(target.absolute), { recursive: true, mode: 0o700 });
    if (params.append === true) {
      await appendFile(target.absolute, bytes);
    } else {
      await writeFile(target.absolute, bytes);
    }
    const info = await statFile(target.absolute);
    this.emitThreadFilesChanged(ctx, target.absolute);
    return { path: target.echo, size: info.size };
  }

  private emitThreadFilesChanged(ctx: HostCallContext, absolute: string): void {
    if (ctx.threadId === undefined) {
      return;
    }
    const root = threadFileRootOfPath(absolute, this.layout.threadDir(ctx.orgId, ctx.threadId));
    if (root !== null) {
      this.events.emit(ctx.orgId, {
        type: 'files-changed',
        threadId: ctx.threadId,
        roots: [root],
      });
    }
  }

  private resolve(ctx: HostCallContext, rawPath: string): ResolvedTarget {
    if (rawPath.includes('\0')) {
      throw new AddonError('invalid_params', { detail: `invalid file path: ${rawPath}` });
    }
    if (isAbsolute(rawPath)) {
      const absolute = resolve(rawPath);
      if (isPathBlocked(absolute, DEFAULT_PATH_BLOCKLIST)) {
        throw new AddonError('invalid_params', { detail: `path is blocked: ${rawPath}` });
      }
      return { absolute, echo: absolute };
    }
    const root = this.layout.ensureOrgWorkspace(ctx.orgId);
    let absolute: string;
    let base: string;
    try {
      base = resolveWorkspaceFilePath(root, '.');
      absolute = resolveWorkspaceFilePath(root, rawPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AddonError('invalid_params', { detail });
    }
    return { absolute, echo: relative(base, absolute).split(sep).join('/') };
  }
}

async function fileInfo(absolute: string, rawPath: string): Promise<{ size: number; mtime: Date }> {
  const info = await statFile(absolute).catch(() => null);
  if (info === null || !info.isFile()) {
    throw new AddonError('not_found', { detail: `no such file: ${rawPath}` });
  }
  return { size: info.size, mtime: info.mtime };
}

function mediaTypeOf(absolute: string): string {
  return Bun.file(absolute).type || 'application/octet-stream';
}
