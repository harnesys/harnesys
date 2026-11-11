import { appendFile, mkdir, open, stat as statFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, sep } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { resolveWorkspaceFilePath } from 'harnesys/file-access';
import type {
  HostCallContext,
  HostMethodLimits,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { HostFsLayoutPort } from '../../../../domain/machine/host-fs-layout.port.ts';
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
  relative: string;
}

@Injectable()
export class FilesHostService implements HostServiceModule {
  readonly namespace = 'files';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly layout: HostFsLayoutPort) {
    this.methods = [
      serviceMethod('files.stat', STAT_LIMITS, (ctx, params) => this.stat(ctx, params)),
      serviceMethod('files.read', READ_LIMITS, (ctx, params) => this.read(ctx, params)),
      serviceMethod('files.write', WRITE_LIMITS, (ctx, params) => this.write(ctx, params)),
    ];
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
      path: target.relative,
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
    return { path: target.relative, size: info.size };
  }

  private resolve(ctx: HostCallContext, rawPath: string): ResolvedTarget {
    const root = this.layout.ensureOrgWorkspace(ctx.orgId);
    let absolute: string;
    try {
      absolute = resolveWorkspaceFilePath(root, rawPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AddonError('invalid_params', { detail });
    }
    return { absolute, relative: relative(root, absolute).split(sep).join('/') };
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
